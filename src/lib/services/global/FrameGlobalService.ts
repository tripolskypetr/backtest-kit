import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import ExecutionContextService from "../context/ExecutionContextService";
import FrameConnectionService from "../connection/FrameConnectionService";
import FrameValidationService from "../validation/FrameValidationService";

const METHOD_NAME_GET_TIMEFRAME = "frameGlobalService getTimeframe";

/**
 * Global service for frame operations.
 *
 * Wraps FrameConnectionService for timeframe generation.
 * Used internally by BacktestLogicPrivateService.
 */
export class FrameGlobalService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly frameConnectionService = inject<FrameConnectionService>(
    TYPES.frameConnectionService
  );
  private readonly frameValidationService = inject<FrameValidationService>(
    TYPES.frameValidationService
  );

  /**
   * Generates timeframe array for backtest iteration.
   *
   * @param frameName - Target frame name (e.g., "1m", "1h")
   * @returns Promise resolving to array of Date objects
   */
  public getTimeframe = async (symbol: string, frameName: string) => {
    this.loggerService.log(METHOD_NAME_GET_TIMEFRAME, {
      frameName,
      symbol,
    });
    this.frameValidationService.validate(frameName, METHOD_NAME_GET_TIMEFRAME);
    return await this.frameConnectionService.getTimeframe(symbol, frameName);
  };
}

export default FrameGlobalService;
