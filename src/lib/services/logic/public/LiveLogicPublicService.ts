import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import LiveLogicPrivateService from "../private/LiveLogicPrivateService";
import MethodContextService from "../../context/MethodContextService";

export class LiveLogicPublicService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly liveLogicPrivateService = inject<LiveLogicPrivateService>(
    TYPES.liveLogicPrivateService
  );

  public run = (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
    }
  ) => {
    this.loggerService.log("liveLogicPublicService run", {
      symbol,
      context,
    });
    return MethodContextService.runAsyncIterator(
      this.liveLogicPrivateService.run(symbol),
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: "",
      }
    );
  };
}

export default LiveLogicPublicService;
