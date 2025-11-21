import { IStrategyTickResultClosed, IStrategyTickResultOpened } from "../interfaces/Strategy.interface";
import backtest from "../lib";

const LIVE_METHOD_NAME_RUN = "LiveUtils.run";
const LIVE_METHOD_NAME_BACKGROUND = "LiveUtils.background";

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
    }
  ) => {
    backtest.loggerService.info(LIVE_METHOD_NAME_RUN, {
      symbol,
      context,
    });
    return backtest.liveGlobalService.run(symbol, context);
  };

  /**
   * Runs live trading in background without yielding results.
   *
   * Consumes all live trading results internally without exposing them.
   * Infinite loop - will run until process is stopped or crashes.
   * Useful for running live trading for side effects only (callbacks, persistence).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy and exchange names
   * @returns Cancellation closure
   *
   * @example
   * ```typescript
   * // Run live trading silently in background, only callbacks will fire
   * // This will run forever until Ctrl+C
   * await Live.background("BTCUSDT", {
   *   strategyName: "my-strategy",
   *   exchangeName: "my-exchange"
   * });
   * ```
   */
  public background = async (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
    }
  ) => {
    backtest.loggerService.info(LIVE_METHOD_NAME_BACKGROUND, {
      symbol,
      context,
    });
    const iterator = this.run(symbol, context);
    let isStopped = false;
    let lastValue: IStrategyTickResultOpened | IStrategyTickResultClosed | null = null;
    const task = async () => {
      while (true) {
        const { value, done } = await iterator.next();
        if (value) {
          lastValue = value;
        }
        if (done) {
          break;
        }
        if (lastValue?.action === "closed" && isStopped) {
          break;
        }
      }
    }
    task();
    return () => {
      isStopped = true;
    };
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
 * })) {
 *   console.log("Result:", result.action);
 * }
 * ```
 */
export const Live = new LiveUtils();
