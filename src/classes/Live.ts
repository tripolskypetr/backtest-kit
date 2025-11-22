import {
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  StrategyName,
} from "../interfaces/Strategy.interface";
import backtest from "../lib";
import { errorEmitter, doneEmitter } from "../config/emitters";
import { getErrorMessage } from "functools-kit";

const LIVE_METHOD_NAME_RUN = "LiveUtils.run";
const LIVE_METHOD_NAME_BACKGROUND = "LiveUtils.background";
const LIVE_METHOD_NAME_GET_REPORT = "LiveUtils.getReport";
const LIVE_METHOD_NAME_DUMP = "LiveUtils.dump";

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
    backtest.liveMarkdownService.clear(context.strategyName);
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
  public background = (
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
    let lastValue:
      | IStrategyTickResultOpened
      | IStrategyTickResultClosed
      | null = null;
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
      await doneEmitter.next({
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        backtest: false,
        symbol,
      });
    };
    task().catch((error) =>
      errorEmitter.next(new Error(getErrorMessage(error)))
    );
    return () => {
      isStopped = true;
    };
  };

  /**
   * Generates markdown report with all events for a strategy.
   *
   * @param strategyName - Strategy name to generate report for
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Live.getReport("my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (strategyName: StrategyName): Promise<string> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_GET_REPORT, {
      strategyName,
    });
    return await backtest.liveMarkdownService.getReport(strategyName);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param strategyName - Strategy name to save report for
   * @param path - Optional directory path to save report (default: "./logs/live")
   *
   * @example
   * ```typescript
   * // Save to default path: ./logs/live/my-strategy.md
   * await Live.dump("my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await Live.dump("my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    strategyName: StrategyName,
    path?: string
  ): Promise<void> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_DUMP, {
      strategyName,
      path,
    });
    await backtest.liveMarkdownService.dump(strategyName, path);
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
