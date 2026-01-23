import { IProvider } from "../../../interface/Provider.interface";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import AxisProviderService, {
  AXIS_SYMBOL,
} from "../provider/AxisProviderService";
import CandleProviderService from "../provider/CandleProviderService";
import { singleshot } from "functools-kit";
import LoggerService from "../base/LoggerService";
import PineConnectionService from "../connection/PineConnectionService";
import { CandleInterval } from "backtest-kit";
import { Code } from "../../../classes/Code";

const CREATE_PROVIDER_FN = singleshot(
  (self: PineJobService): IProvider => ({
    async getMarketData(tickerId, timeframe, limit, sDate, eDate) {
      if (tickerId === AXIS_SYMBOL) {
        return await self.axisProviderService.getMarketData(
          tickerId,
          timeframe,
          limit,
          sDate,
          eDate,
        );
      }
      return await self.candleProviderService.getMarketData(
        tickerId,
        timeframe,
        limit,
        sDate,
        eDate,
      );
    },

    async getSymbolInfo(tickerId) {
      if (tickerId === AXIS_SYMBOL) {
        return await self.axisProviderService.getSymbolInfo();
      }
      return await self.candleProviderService.getSymbolInfo(tickerId);
    },
  }),
);

const CREATE_RUNNER_FN = async (
  self: PineJobService,
  tickerId: string,
  timeframe: string,
  limit: number,
) => {
  const provider: IProvider = CREATE_PROVIDER_FN(self);
  const instance = await self.pineConnectionService.getInstance(
    provider,
    tickerId,
    timeframe,
    limit,
  );
  await instance.ready();
  return instance;
};

export class PineJobService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly axisProviderService = inject<AxisProviderService>(
    TYPES.axisProviderService,
  );
  readonly candleProviderService = inject<CandleProviderService>(
    TYPES.candleProviderService,
  );
  readonly pineConnectionService = inject<PineConnectionService>(
    TYPES.pineConnectionService,
  );

  public run = async (
    code: Code,
    tickerId: string,
    timeframe: CandleInterval = "1m",
    limit: number = 100,
  ) => {
    this.loggerService.log("pineJobService run", {
      script: code.source,
      tickerId,
      timeframe,
      limit,
    });

    const runner = await CREATE_RUNNER_FN(this, tickerId, timeframe, limit);

    return await runner.run(code.source);
  };
}

export default PineJobService;
