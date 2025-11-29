import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { FrameName, IFrame } from "../../../interfaces/Frame.interface";
import { memoize } from "functools-kit";
import ClientFrame from "../../../client/ClientFrame";
import FrameSchemaService from "../schema/FrameSchemaService";
import { TMethodContextService } from "../context/MethodContextService";

/**
 * Connection service routing frame operations to correct ClientFrame instance.
 *
 * Routes all IFrame method calls to the appropriate frame implementation
 * based on methodContextService.context.frameName. Uses memoization to cache
 * ClientFrame instances for performance.
 *
 * Key features:
 * - Automatic frame routing via method context
 * - Memoized ClientFrame instances by frameName
 * - Implements IFrame interface
 * - Backtest timeframe management (startDate, endDate, interval)
 *
 * Note: frameName is empty string for live mode (no frame constraints).
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const timeframe = await frameConnectionService.getTimeframe("BTCUSDT");
 * // Automatically routes to correct frame based on methodContext
 * ```
 */
export class FrameConnectionService implements IFrame {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly frameSchemaService = inject<FrameSchemaService>(
    TYPES.frameSchemaService
  );
  private readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );

  /**
   * Retrieves memoized ClientFrame instance for given frame name.
   *
   * Creates ClientFrame on first call, returns cached instance on subsequent calls.
   * Cache key is frameName string.
   *
   * @param frameName - Name of registered frame schema
   * @returns Configured ClientFrame instance
   */
  public getFrame = memoize(
    ([frameName]) => `${frameName}`,
    (frameName: FrameName) => {
      const { endDate, interval, startDate, callbacks } =
        this.frameSchemaService.get(frameName);
      return new ClientFrame({
        frameName,
        logger: this.loggerService,
        startDate,
        endDate,
        interval,
        callbacks,
      });
    }
  );

  /**
   * Retrieves backtest timeframe boundaries for symbol.
   *
   * Returns startDate and endDate from frame configuration.
   * Used to limit backtest execution to specific date range.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @returns Promise resolving to { startDate: Date, endDate: Date }
   */
  public getTimeframe = async (symbol: string, frameName: string) => {
    this.loggerService.log("frameConnectionService getTimeframe", {
      symbol,
      frameName,
    });
    return await this.getFrame(
      this.methodContextService.context.frameName
    ).getTimeframe(symbol);
  };
}

export default FrameConnectionService;
