import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import { IStrategyTickResultClosed } from "../../../../interfaces/Strategy.interface";
import StrategyGlobalService from "../../global/StrategyGlobalService";
import ExchangeGlobalService from "../../global/ExchangeGlobalService";

export class BacktestLogicPrivateService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly strategyGlobalService = inject<StrategyGlobalService>(
    TYPES.strategyGlobalService
  );
  private readonly exchangeGlobalService = inject<ExchangeGlobalService>(
    TYPES.exchangeGlobalService
  );

  public run = async (
    symbol: string,
    timeframes: Date[]
  ): Promise<IStrategyTickResultClosed[]> => {
    this.loggerService.log("backtestLogicPrivateService run", {
      symbol,
      timeframesCount: timeframes.length,
    });

    const results: IStrategyTickResultClosed[] = [];
    let i = 0;

    while (i < timeframes.length) {
      const when = timeframes[i];

      const result = await this.strategyGlobalService.tick(symbol, when, true);

      // Если сигнал открыт, вызываем backtest
      if (result.action === "opened") {
        const signal = result.signal;

        this.loggerService.log("backtestLogicPrivateService signal opened", {
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
            return results;
        }

        this.loggerService.log("backtestLogicPrivateService got candles", {
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

        // Сохраняем результат (всегда closed)
        results.push(backtestResult);

        this.loggerService.log("backtestLogicPrivateService signal closed", {
          symbol,
          signalId: backtestResult.signal.id,
          closeTimestamp: backtestResult.closeTimestamp,
          closeReason: backtestResult.closeReason,
        });

        // Пропускаем timeframes до closeTimestamp
        while (
          i < timeframes.length &&
          timeframes[i].getTime() < backtestResult.closeTimestamp
        ) {
          i++;
        }
        continue;
      }

      // Сохраняем closed результаты из tick (после type guard)
      if (result.action === "closed") {
        results.push(result as IStrategyTickResultClosed);
      }

      i++;
    }

    return results;
  };
}

export default BacktestLogicPrivateService;
