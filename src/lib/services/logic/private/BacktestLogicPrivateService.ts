import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import { IStrategyTickResultClosed } from "../../../../interfaces/Strategy.interface";
import StrategyGlobalService from "../../global/StrategyGlobalService";
import ExchangeGlobalService from "../../global/ExchangeGlobalService";
import FrameGlobalService from "../../global/FrameGlobalService";
import MethodContextService, {
  TMethodContextService,
} from "../../context/MethodContextService";
import {
  progressEmitter,
  performanceEmitter,
} from "../../../../config/emitters";
import { GLOBAL_CONFIG } from "../../../../config/params";

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
  private readonly strategyGlobalService = inject<StrategyGlobalService>(
    TYPES.strategyGlobalService
  );
  private readonly exchangeGlobalService = inject<ExchangeGlobalService>(
    TYPES.exchangeGlobalService
  );
  private readonly frameGlobalService = inject<FrameGlobalService>(
    TYPES.frameGlobalService
  );
  private readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
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

    const timeframes = await this.frameGlobalService.getTimeframe(
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
        await progressEmitter.next({
          exchangeName: this.methodContextService.context.exchangeName,
          strategyName: this.methodContextService.context.strategyName,
          symbol,
          totalFrames,
          processedFrames: i,
          progress: totalFrames > 0 ? i / totalFrames : 0,
        });
      }

      const result = await this.strategyGlobalService.tick(symbol, when, true);

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
        const candles = await this.exchangeGlobalService.getNextCandles(
          symbol,
          "1m",
          GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES,
          when,
          true
        );

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
          }
        );

        // backtest() сам обработает scheduled signal: найдет активацию/отмену
        // и если активируется - продолжит с TP/SL мониторингом
        const backtestResult = await this.strategyGlobalService.backtest(
          symbol,
          candles,
          when,
          true
        );

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

        // Получаем свечи для бектеста
        const candles = await this.exchangeGlobalService.getNextCandles(
          symbol,
          "1m",
          signal.minuteEstimatedTime,
          when,
          true
        );

        if (!candles.length) {
          return;
        }

        this.loggerService.info("backtestLogicPrivateService candles fetched", {
          symbol,
          signalId: signal.id,
          candlesCount: candles.length,
        });

        // Вызываем backtest - всегда возвращает closed
        const backtestResult = await this.strategyGlobalService.backtest(
          symbol,
          candles,
          when,
          true
        );

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
        symbol,
        backtest: true,
      });
      previousEventTimestamp = currentTimestamp;

      i++;
    }

    // Emit final progress event (100%)
    {
      await progressEmitter.next({
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
      symbol,
      backtest: true,
    });
    previousEventTimestamp = currentTimestamp;
  }
}

export default BacktestLogicPrivateService;
