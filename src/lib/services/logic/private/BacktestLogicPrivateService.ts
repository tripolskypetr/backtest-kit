import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import { IStrategyBacktestResult, IStrategyTickResult, IStrategyTickResultOpened } from "../../../../interfaces/Strategy.interface";
import { ICandleData } from "../../../../interfaces/Exchange.interface";
import StrategyCoreService from "../../core/StrategyCoreService";
import ExchangeCoreService from "../../core/ExchangeCoreService";
import FrameCoreService from "../../core/FrameCoreService";
import { TMethodContextService } from "../../context/MethodContextService";
import {
  progressBacktestEmitter,
  performanceEmitter,
  errorEmitter,
  backtestScheduleOpenSubject,
  signalBacktestEmitter,
  signalEmitter,
} from "../../../../config/emitters";
import { GLOBAL_CONFIG } from "../../../../config/params";
import { and, errorData, getErrorMessage } from "functools-kit";
import ActionCoreService from "../../core/ActionCoreService";

/**
 * Private service for backtest orchestration using async generators.
 *
 * Flow:
 * 1. Get timeframes from frame service
 * 2. Iterate through timeframes calling tick()
 * 3. When signal opens: fetch candles and call backtest()
 * 4. Skip timeframes until signal closes
 * 5. Yield closed result and continue
 *
 * Memory efficient: streams results without array accumulation.
 * Supports early termination via break in consumer.
 */
export class BacktestLogicPrivateService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly strategyCoreService = inject<StrategyCoreService>(
    TYPES.strategyCoreService
  );
  private readonly exchangeCoreService = inject<ExchangeCoreService>(
    TYPES.exchangeCoreService
  );
  private readonly frameCoreService = inject<FrameCoreService>(
    TYPES.frameCoreService
  );
  private readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );
  private readonly actionCoreService = inject<ActionCoreService>(
    TYPES.actionCoreService
  );

  /**
   * Runs backtest for a symbol, streaming closed signals as async generator.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @yields Closed signal results with PNL
   *
   * @example
   * ```typescript
   * for await (const result of backtestLogic.run("BTCUSDT")) {
   *   console.log(result.closeReason, result.pnl.pnlPercentage);
   *   if (result.pnl.pnlPercentage < -10) break; // Early termination
   * }
   * ```
   */
  public async *run(symbol: string) {
    this.loggerService.log("backtestLogicPrivateService run", {
      symbol,
    });

    const backtestStartTime = performance.now();

    const timeframes = await this.frameCoreService.getTimeframe(
      symbol,
      this.methodContextService.context.frameName
    );
    const totalFrames = timeframes.length;

    let i = 0;
    let previousEventTimestamp: number | null = null;

    while (i < timeframes.length) {
      const timeframeStartTime = performance.now();
      const when = timeframes[i];

      // Emit progress event if context is available
      {
        await progressBacktestEmitter.next({
          exchangeName: this.methodContextService.context.exchangeName,
          strategyName: this.methodContextService.context.strategyName,
          symbol,
          totalFrames,
          processedFrames: i,
          progress: totalFrames > 0 ? i / totalFrames : 0,
        });
      }

      // Check if strategy should stop before processing next frame
      if (
        await this.strategyCoreService.getStopped(
          true,
          symbol,
          {
            strategyName: this.methodContextService.context.strategyName,
            exchangeName: this.methodContextService.context.exchangeName,
            frameName: this.methodContextService.context.frameName,
          }
        )
      ) {
        this.loggerService.info(
          "backtestLogicPrivateService stopped by user request (before tick)",
          {
            symbol,
            when: when.toISOString(),
            processedFrames: i,
            totalFrames,
          }
        );
        break;
      }

      let result: IStrategyTickResult;
      try {
        result = await this.strategyCoreService.tick(symbol, when, true, {
          strategyName: this.methodContextService.context.strategyName,
          exchangeName: this.methodContextService.context.exchangeName,
          frameName: this.methodContextService.context.frameName,
        });
      } catch (error) {
        console.warn(`backtestLogicPrivateService tick failed, skipping timeframe when=${when.toISOString()} symbol=${symbol} strategyName=${this.methodContextService.context.strategyName} exchangeName=${this.methodContextService.context.exchangeName}`);
        this.loggerService.warn(
          "backtestLogicPrivateService tick failed, skipping timeframe",
          {
            symbol,
            when: when.toISOString(),
            error: errorData(error), message: getErrorMessage(error),
          }
        );
        await errorEmitter.next(error);
        i++;
        continue;
      }

      // Check if strategy should stop when idle (no active signal)
      if (
        await and(
          Promise.resolve(result.action === "idle"),
          this.strategyCoreService.getStopped(
            true,
            symbol,
            {
              strategyName: this.methodContextService.context.strategyName,
              exchangeName: this.methodContextService.context.exchangeName,
              frameName: this.methodContextService.context.frameName,
            }
          )
        )
      ) {
        this.loggerService.info(
          "backtestLogicPrivateService stopped by user request (idle state)",
          {
            symbol,
            when: when.toISOString(),
            processedFrames: i,
            totalFrames,
          }
        );
        break;
      }

      // Если scheduled signal создан - обрабатываем через backtest()
      if (result.action === "scheduled") {
        const signalStartTime = performance.now();
        const signal = result.signal;

        this.loggerService.info(
          "backtestLogicPrivateService scheduled signal detected",
          {
            symbol,
            signalId: signal.id,
            priceOpen: signal.priceOpen,
            minuteEstimatedTime: signal.minuteEstimatedTime,
          }
        );

        // Запрашиваем минутные свечи для мониторинга активации/отмены
        // КРИТИЧНО: запрашиваем:
        // - CC_AVG_PRICE_CANDLES_COUNT-1 для буфера VWAP (ДО when)
        // - CC_SCHEDULE_AWAIT_MINUTES для ожидания активации
        // - minuteEstimatedTime для работы сигнала ПОСЛЕ активации
        // - +1 потому что when включается как первая свеча
        const bufferMinutes = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - 1;
        const bufferStartTime = new Date(when.getTime() - bufferMinutes * 60 * 1000);
        const candlesNeeded = bufferMinutes + GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES + signal.minuteEstimatedTime + 1;

        let candles: ICandleData[];
        try {
          candles = await this.exchangeCoreService.getNextCandles(
            symbol,
            "1m",
            candlesNeeded,
            bufferStartTime,
            true
          );
        } catch (error) {
          console.warn(`backtestLogicPrivateService getNextCandles failed for scheduled signal when=${when.toISOString()} symbol=${symbol} strategyName=${this.methodContextService.context.strategyName} exchangeName=${this.methodContextService.context.exchangeName}`);
          this.loggerService.warn(
            "backtestLogicPrivateService getNextCandles failed for scheduled signal",
            {
              symbol,
              signalId: signal.id,
              candlesNeeded,
              bufferMinutes,
              error: errorData(error), message: getErrorMessage(error),
            }
          );
          await errorEmitter.next(error);
          i++;
          continue;
        }

        if (!candles.length) {
          i++;
          continue;
        }

        this.loggerService.info(
          "backtestLogicPrivateService candles fetched for scheduled",
          {
            symbol,
            signalId: signal.id,
            candlesCount: candles.length,
            candlesNeeded,
          }
        );

        // backtest() сам обработает scheduled signal: найдет активацию/отмену
        // и если активируется - продолжит с TP/SL мониторингом
        let backtestResult: IStrategyBacktestResult;

        let unScheduleOpen: Function;
        let scheduleOpenResult: IStrategyTickResultOpened;

        {
          const { strategyName, exchangeName, frameName } = this.methodContextService.context;

          unScheduleOpen = backtestScheduleOpenSubject.filter((event) => {
            let isOk = true;
            {
              isOk = isOk && event.action === "opened";
              isOk = isOk && event.strategyName === strategyName;
              isOk = isOk && event.exchangeName === exchangeName;
              isOk = isOk && event.frameName === frameName;
              isOk = isOk && event.symbol === symbol;
            }
            return isOk;
          }).connect(async (tick) => {
            scheduleOpenResult = tick;
            await signalEmitter.next(tick);
            await signalBacktestEmitter.next(tick);
            await this.actionCoreService.signalBacktest(true, tick, {
              strategyName, 
              exchangeName,
              frameName, 
            });
          });
        }

        try {
          backtestResult = await this.strategyCoreService.backtest(
            symbol,
            candles,
            when,
            true,
            {
              strategyName: this.methodContextService.context.strategyName,
              exchangeName: this.methodContextService.context.exchangeName,
              frameName: this.methodContextService.context.frameName,
            }
          );
        } catch (error) {
          console.warn(`backtestLogicPrivateService backtest failed for scheduled signal when=${when.toISOString()} symbol=${symbol} strategyName=${this.methodContextService.context.strategyName} exchangeName=${this.methodContextService.context.exchangeName}`);
          this.loggerService.warn(
            "backtestLogicPrivateService backtest failed for scheduled signal",
            {
              symbol,
              signalId: signal.id,
              error: errorData(error), message: getErrorMessage(error),
            }
          );
          await errorEmitter.next(error);
          i++;
          continue;
        } finally {
          unScheduleOpen && unScheduleOpen();
        }

        this.loggerService.info(
          "backtestLogicPrivateService scheduled signal closed",
          {
            symbol,
            signalId: backtestResult.signal.id,
            closeTimestamp: backtestResult.closeTimestamp,
            action: backtestResult.action,
            closeReason:
              backtestResult.action === "closed"
                ? backtestResult.closeReason
                : undefined,
          }
        );

        // Track signal processing duration
        const signalEndTime = performance.now();
        const currentTimestamp = Date.now();
        await performanceEmitter.next({
          timestamp: currentTimestamp,
          previousTimestamp: previousEventTimestamp,
          metricType: "backtest_signal",
          duration: signalEndTime - signalStartTime,
          strategyName: this.methodContextService.context.strategyName,
          exchangeName: this.methodContextService.context.exchangeName,
          frameName: this.methodContextService.context.frameName,
          symbol,
          backtest: true,
        });
        previousEventTimestamp = currentTimestamp;

        // Пропускаем timeframes до closeTimestamp
        while (
          i < timeframes.length &&
          timeframes[i].getTime() < backtestResult.closeTimestamp
        ) {
          i++;
        }

        if (scheduleOpenResult) {
          yield scheduleOpenResult;
        }

        yield backtestResult;

        // Check if strategy should stop after signal is closed
        if (
          await this.strategyCoreService.getStopped(
            true,
            symbol,
            {
              strategyName: this.methodContextService.context.strategyName,
              exchangeName: this.methodContextService.context.exchangeName,
              frameName: this.methodContextService.context.frameName,
            }
          )
        ) {
          this.loggerService.info(
            "backtestLogicPrivateService stopped by user request (after scheduled signal closed)",
            {
              symbol,
              signalId: backtestResult.signal.id,
              processedFrames: i,
              totalFrames,
            }
          );
          break;
        }
      }

      // Если обычный сигнал открыт, вызываем backtest
      if (result.action === "opened") {
        const signalStartTime = performance.now();
        const signal = result.signal;

        this.loggerService.info("backtestLogicPrivateService signal opened", {
          symbol,
          signalId: signal.id,
          minuteEstimatedTime: signal.minuteEstimatedTime,
        });

        // КРИТИЧНО: Получаем свечи включая буфер для VWAP
        // Сдвигаем начало назад на CC_AVG_PRICE_CANDLES_COUNT-1 минут для буфера VWAP
        // Запрашиваем minuteEstimatedTime + буфер свечей одним запросом
        const bufferMinutes = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - 1;
        const bufferStartTime = new Date(when.getTime() - bufferMinutes * 60 * 1000);
        const totalCandles = signal.minuteEstimatedTime + GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;

        let candles: ICandleData[];
        try {
          candles = await this.exchangeCoreService.getNextCandles(
            symbol,
            "1m",
            totalCandles,
            bufferStartTime,
            true
          );
        } catch (error) {
          console.warn(`backtestLogicPrivateService getNextCandles failed for opened signal when=${when.toISOString()} symbol=${symbol} strategyName=${this.methodContextService.context.strategyName} exchangeName=${this.methodContextService.context.exchangeName}`);
          this.loggerService.warn(
            "backtestLogicPrivateService getNextCandles failed for opened signal",
            {
              symbol,
              signalId: signal.id,
              totalCandles,
              bufferMinutes,
              error: errorData(error), message: getErrorMessage(error),
            }
          );
          await errorEmitter.next(error);
          i++;
          continue;
        }

        if (!candles.length) {
          i++;
          continue;
        }

        this.loggerService.info("backtestLogicPrivateService candles fetched", {
          symbol,
          signalId: signal.id,
          candlesCount: candles.length,
        });

        // Вызываем backtest - всегда возвращает closed
        let backtestResult: IStrategyBacktestResult;
        try {
          backtestResult = await this.strategyCoreService.backtest(
            symbol,
            candles,
            when,
            true,
            {
              strategyName: this.methodContextService.context.strategyName,
              exchangeName: this.methodContextService.context.exchangeName,
              frameName: this.methodContextService.context.frameName,
            }
          );
        } catch (error) {
          console.warn(`backtestLogicPrivateService backtest failed for opened signal when=${when.toISOString()} symbol=${symbol} strategyName=${this.methodContextService.context.strategyName} exchangeName=${this.methodContextService.context.exchangeName}`);
          this.loggerService.warn(
            "backtestLogicPrivateService backtest failed for opened signal",
            {
              symbol,
              signalId: signal.id,
              error: errorData(error), message: getErrorMessage(error),
            }
          );
          await errorEmitter.next(error);
          i++;
          continue;
        }

        this.loggerService.info("backtestLogicPrivateService signal closed", {
          symbol,
          signalId: backtestResult.signal.id,
          closeTimestamp: backtestResult.closeTimestamp,
        });

        // Track signal processing duration
        const signalEndTime = performance.now();
        const currentTimestamp = Date.now();
        await performanceEmitter.next({
          timestamp: currentTimestamp,
          previousTimestamp: previousEventTimestamp,
          metricType: "backtest_signal",
          duration: signalEndTime - signalStartTime,
          strategyName: this.methodContextService.context.strategyName,
          exchangeName: this.methodContextService.context.exchangeName,
          frameName: this.methodContextService.context.frameName,
          symbol,
          backtest: true,
        });
        previousEventTimestamp = currentTimestamp;

        // Пропускаем timeframes до closeTimestamp
        while (
          i < timeframes.length &&
          timeframes[i].getTime() < backtestResult.closeTimestamp
        ) {
          i++;
        }

        yield backtestResult;

        // Check if strategy should stop after signal is closed
        if (
          await this.strategyCoreService.getStopped(
            true,
            symbol,
            {
              strategyName: this.methodContextService.context.strategyName,
              exchangeName: this.methodContextService.context.exchangeName,
              frameName: this.methodContextService.context.frameName,
            }
          )
        ) {
          this.loggerService.info(
            "backtestLogicPrivateService stopped by user request (after signal closed)",
            {
              symbol,
              signalId: backtestResult.signal.id,
              processedFrames: i,
              totalFrames,
            }
          );
          break;
        }
      }

      // Track timeframe processing duration
      const timeframeEndTime = performance.now();
      const currentTimestamp = Date.now();
      await performanceEmitter.next({
        timestamp: currentTimestamp,
        previousTimestamp: previousEventTimestamp,
        metricType: "backtest_timeframe",
        duration: timeframeEndTime - timeframeStartTime,
        strategyName: this.methodContextService.context.strategyName,
        exchangeName: this.methodContextService.context.exchangeName,
        frameName: this.methodContextService.context.frameName,
        symbol,
        backtest: true,
      });
      previousEventTimestamp = currentTimestamp;

      i++;
    }

    // Emit final progress event (100%)
    {
      await progressBacktestEmitter.next({
        exchangeName: this.methodContextService.context.exchangeName,
        strategyName: this.methodContextService.context.strategyName,
        symbol,
        totalFrames,
        processedFrames: totalFrames,
        progress: 1.0,
      });
    }

    // Track total backtest duration
    const backtestEndTime = performance.now();
    const currentTimestamp = Date.now();
    await performanceEmitter.next({
      timestamp: currentTimestamp,
      previousTimestamp: previousEventTimestamp,
      metricType: "backtest_total",
      duration: backtestEndTime - backtestStartTime,
      strategyName: this.methodContextService.context.strategyName,
      exchangeName: this.methodContextService.context.exchangeName,
      frameName: this.methodContextService.context.frameName,
      symbol,
      backtest: true,
    });
    previousEventTimestamp = currentTimestamp;
  }
}

export default BacktestLogicPrivateService;
