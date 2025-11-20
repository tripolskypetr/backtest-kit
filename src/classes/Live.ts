import backtest from "../lib";

const LIVE_METHOD_NAME_RUN = "LiveUtils.run";

/**
 * Utility class for live trading operations.
 *
 * Provides simplified access to liveGlobalService.run() with logging.
 * Exported as singleton instance for convenient usage.
 *
 * Features:
 * - Infinite async generator (never completes)
 * - Crash recovery via persisted state
 * - Real-time progression with Date.now()
 *
 * @example
 * ```typescript
 * import { Live } from "./classes/Live";
 *
 * // Infinite loop - use Ctrl+C to stop
 * for await (const result of Live.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: ""
 * })) {
 *   if (result.action === "opened") {
 *     console.log("Signal opened:", result.signal);
 *   } else if (result.action === "closed") {
 *     console.log("PNL:", result.pnl.pnlPercentage);
 *   }
 * }
 * ```
 */
export class LiveUtils {
  /**
   * Runs live trading for a symbol with context propagation.
   *
   * Infinite async generator with crash recovery support.
   * Process can crash and restart - state will be recovered from disk.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy and exchange names
   * @returns Infinite async generator yielding opened and closed signals
   */
  public run = (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    }
  ) => {
    backtest.loggerService.info(LIVE_METHOD_NAME_RUN, {
      symbol,
      context,
    });
    return backtest.liveGlobalService.run(symbol, context);
  };
}

/**
 * Singleton instance of LiveUtils for convenient live trading operations.
 *
 * @example
 * ```typescript
 * import { Live } from "./classes/Live";
 *
 * for await (const result of Live.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: ""
 * })) {
 *   console.log("Result:", result.action);
 * }
 * ```
 */
export const Live = new LiveUtils();
