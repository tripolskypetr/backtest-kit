import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { IStrategyTickResultClosed } from "../../../interfaces/Strategy.interface";
import StrategyPublicService from "../public/StrategyPublicService";
import ExchangePublicService from "../public/ExchangePublicService";

export class BacktestLogicService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly strategyPublicService = inject<StrategyPublicService>(
    TYPES.strategyPublicService
  );
  private readonly exchangePublicService = inject<ExchangePublicService>(
    TYPES.exchangePublicService
  );

  public run = async (
    symbol: string,
    timeframes: Date[]
  ): Promise<IStrategyTickResultClosed[]> => {
    this.loggerService.log("backtestLogicService run", {
      symbol,
      timeframesCount: timeframes.length,
    });

    const results: IStrategyTickResultClosed[] = [];
    let i = 0;

    while (i < timeframes.length) {
      const when = timeframes[i];

      const result = await this.strategyPublicService.tick(symbol, when, true);

      // Если сигнал открыт, вызываем backtest
      if (result.action === "opened") {
        const signal = result.signal;

        this.loggerService.log("backtestLogicService signal opened", {
          symbol,
          signalId: signal.id,
          minuteEstimatedTime: signal.minuteEstimatedTime,
        });

        // Получаем свечи для бектеста
        const candles = await this.exchangePublicService.getNextCandles(
          symbol,
          "1m",
          signal.minuteEstimatedTime,
          when,
          true
        );

        if (!candles.length) {
            return results;
        }

        this.loggerService.log("backtestLogicService got candles", {
          symbol,
          signalId: signal.id,
          candlesCount: candles.length,
        });

        // Вызываем backtest - всегда возвращает closed
        const backtestResult = await this.strategyPublicService.backtest(
          symbol,
          candles,
          when,
          true
        );

        // Сохраняем результат (всегда closed)
        results.push(backtestResult);

        this.loggerService.log("backtestLogicService signal closed", {
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

export default BacktestLogicService;
