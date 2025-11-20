import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import { IStrategyTickResultClosed } from "../../../../interfaces/Strategy.interface";
import StrategyGlobalService from "../../global/StrategyGlobalService";
import ExchangeGlobalService from "../../global/ExchangeGlobalService";
import FrameGlobalService from "../../global/FrameGlobalService";

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

  public async *run(symbol: string) {
    this.loggerService.log("backtestLogicPrivateService run", {
      symbol,
    });

    const timeframes = await this.frameGlobalService.getTimeframe(symbol);

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
          return;
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

        yield backtestResult;
      }

      i++;
    }
  }
}

export default BacktestLogicPrivateService;
