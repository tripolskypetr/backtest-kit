import { PineTS } from "pinets";
1;
import { IProvider } from "../../../interface/Provider.interface";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import AxisProviderService, {
  AXIS_SYMBOL,
} from "../provider/AxisProviderService";
import CandleProviderService from "../provider/CandleProviderService";
import { singleshot } from "functools-kit";
import LoggerService from "../base/LoggerService";

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
  const pineTS = new PineTS(provider, tickerId, timeframe, limit);
  await pineTS.ready();
  return pineTS;
};

export class PineJobService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly axisProviderService = inject<AxisProviderService>(
    TYPES.axisProviderService,
  );
  readonly candleProviderService = inject<CandleProviderService>(
    TYPES.candleProviderService,
  );

  public run = async (
    script: string | Function,
    tickerId: string,
    timeframe: string = "1m",
    limit: number = 100,
  ) => {
    this.loggerService.log("pineJobService run", {
      script,
      tickerId,
      timeframe,
      limit,
    });

    const runner = await CREATE_RUNNER_FN(this, tickerId, timeframe, limit);

    return await runner.run(script);
  };
}

export default PineJobService;
