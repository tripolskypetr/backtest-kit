import {
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  StrategyName,
} from "../interfaces/Strategy.interface";
import backtest from "../lib";
import { exitEmitter, doneLiveSubject } from "../config/emitters";
import { getErrorMessage } from "functools-kit";

const LIVE_METHOD_NAME_RUN = "LiveUtils.run";
const LIVE_METHOD_NAME_BACKGROUND = "LiveUtils.background";
const LIVE_METHOD_NAME_GET_REPORT = "LiveUtils.getReport";
const LIVE_METHOD_NAME_DUMP = "LiveUtils.dump";

/**
 * Utility class for live trading operations.
 *
 * Provides simplified access to liveCommandService.run() with logging.
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

    {
      backtest.liveMarkdownService.clear({ symbol, strategyName: context.strategyName });
      backtest.scheduleMarkdownService.clear({ symbol, strategyName: context.strategyName });
    }

    {
      backtest.strategyGlobalService.clear({ symbol, strategyName: context.strategyName });
    }

    {
      const { riskName } = backtest.strategySchemaService.get(
        context.strategyName
      );
      riskName && backtest.riskGlobalService.clear(riskName);
    }

    return backtest.liveCommandService.run(symbol, context);
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
    let isStopped = false;
    let isDone = false;
    const task = async () => {
      for await (const signal of this.run(symbol, context)) {
        if (signal?.action === "closed" && isStopped) {
          break;
        }
      }
      if (!isDone) {
        await doneLiveSubject.next({
          exchangeName: context.exchangeName,
          strategyName: context.strategyName,
          backtest: false,
          symbol,
        });
      }
      isDone = true;
    };
    task().catch((error) =>
      exitEmitter.next(new Error(getErrorMessage(error)))
    );
    return () => {
      backtest.strategyGlobalService.stop(symbol, context.strategyName);
      backtest.strategyGlobalService
        .getPendingSignal(symbol, context.strategyName)
        .then(async (pendingSignal) => {
          if (pendingSignal) {
            return;
          }
          if (!isDone) {
            await doneLiveSubject.next({
              exchangeName: context.exchangeName,
              strategyName: context.strategyName,
              backtest: false,
              symbol,
            });
          }
          isDone = true;
        });
      isStopped = true;
    };
  };

  /**
   * Gets statistical data from all live trading events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @returns Promise resolving to statistical data object
   *
   * @example
   * ```typescript
   * const stats = await Live.getData("BTCUSDT", "my-strategy");
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName) => {
    backtest.loggerService.info("LiveUtils.getData", {
      symbol,
      strategyName,
    });
    return await backtest.liveMarkdownService.getData(symbol, strategyName);
  };

  /**
   * Generates markdown report with all events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Live.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (symbol: string, strategyName: StrategyName): Promise<string> => {
    backtest.loggerService.info(LIVE_METHOD_NAME_GET_REPORT, {
      symbol,
      strategyName,
    });
    return await backtest.liveMarkdownService.getReport(symbol, strategyName);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param strategyName - Strategy name to save report for
   * @param path - Optional directory path to save report (default: "./dump/live")
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/live/my-strategy.md
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
