import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import { WalkerMetric } from "../../../../interfaces/Walker.interface";
import { StrategyName } from "../../../../interfaces/Strategy.interface";
import BacktestLogicPublicService from "../public/BacktestLogicPublicService";
import BacktestMarkdownService from "../../markdown/BacktestMarkdownService";
import WalkerSchemaService from "../../schema/WalkerSchemaService";
import { WalkerContract } from "../../../../contract/Walker.contract";
import {
  walkerEmitter,
  walkerCompleteSubject,
  walkerStopSubject,
  progressWalkerEmitter,
  errorEmitter,
} from "../../../../config/emitters";
import { errorData, getErrorMessage, resolveDocuments } from "functools-kit";

/**
 * Private service for walker orchestration (strategy comparison).
 *
 * Flow:
 * 1. Yields progress updates as each strategy completes
 * 2. Tracks best metric in real-time
 * 3. Returns final results with all strategies ranked
 *
 * Uses BacktestLogicPublicService internally for each strategy.
 */
export class WalkerLogicPrivateService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly backtestLogicPublicService =
    inject<BacktestLogicPublicService>(TYPES.backtestLogicPublicService);
  private readonly backtestMarkdownService = inject<BacktestMarkdownService>(
    TYPES.backtestMarkdownService
  );
  private readonly walkerSchemaService = inject<WalkerSchemaService>(
    TYPES.walkerSchemaService
  );

  /**
   * Runs walker comparison for a symbol.
   *
   * Executes backtest for each strategy sequentially.
   * Yields WalkerContract after each strategy completes.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategies - List of strategy names to compare
   * @param metric - Metric to use for comparison
   * @param context - Walker context with exchangeName, frameName, walkerName
   * @yields WalkerContract with progress after each strategy
   *
   * @example
   * ```typescript
   * for await (const progress of walkerLogic.run(
   *   "BTCUSDT",
   *   ["strategy-v1", "strategy-v2"],
   *   "sharpeRatio",
   *   {
   *     exchangeName: "binance",
   *     frameName: "1d-backtest",
   *     walkerName: "my-optimizer"
   *   }
   * )) {
   *   console.log("Progress:", progress.strategiesTested, "/", progress.totalStrategies);
   * }
   * ```
   */
  public async *run(
    symbol: string,
    strategies: StrategyName[],
    metric: WalkerMetric,
    context: {
      exchangeName: string;
      frameName: string;
      walkerName: string;
    }
  ): AsyncGenerator<WalkerContract> {
    this.loggerService.log("walkerLogicPrivateService run", {
      symbol,
      strategies,
      metric,
      context,
    });

    // Get walker schema for callbacks
    const walkerSchema = this.walkerSchemaService.get(context.walkerName);

    let strategiesTested = 0;
    let bestMetric: number | null = null;
    let bestStrategy: StrategyName | null = null;

    // Track stopped strategies in Set for efficient lookup
    const stoppedStrategies = new Set<StrategyName>();

    // Subscribe to stop signals and collect them in Set
    // Filter by both symbol AND walkerName to support multiple walkers on same symbol
    // connect() returns destructor function
    const unsubscribe = walkerStopSubject
      .filter((data) => data.symbol === symbol && data.walkerName === context.walkerName)
      .connect((data) => {
        stoppedStrategies.add(data.strategyName);
        this.loggerService.info(
          "walkerLogicPrivateService received stop signal for strategy",
          {
            symbol,
            walkerName: context.walkerName,
            strategyName: data.strategyName,
            stoppedCount: stoppedStrategies.size,
          }
        );
      });

    try {
      // Run backtest for each strategy
      for (const strategyName of strategies) {
        // Check if this strategy should be stopped before starting
        if (stoppedStrategies.has(strategyName)) {
          this.loggerService.info(
            "walkerLogicPrivateService skipping stopped strategy",
            {
              symbol,
              strategyName,
            }
          );
          break;
        }

        // Call onStrategyStart callback if provided
        if (walkerSchema.callbacks?.onStrategyStart) {
          walkerSchema.callbacks.onStrategyStart(strategyName, symbol);
        }
        this.loggerService.info("walkerLogicPrivateService testing strategy", {
          strategyName,
          symbol,
        });

        const iterator = this.backtestLogicPublicService.run(symbol, {
          strategyName,
          exchangeName: context.exchangeName,
          frameName: context.frameName,
        });

        try {
          await resolveDocuments(iterator);
        } catch (error) {
          console.warn(`walkerLogicPrivateService backtest failed symbol=${symbol} strategyName=${strategyName} exchangeName=${context.exchangeName}`);
          this.loggerService.warn(
            "walkerLogicPrivateService backtest failed for strategy, skipping",
            {
              strategyName,
              symbol,
              error: errorData(error), message: getErrorMessage(error),
            }
          );
          await errorEmitter.next(error);
          // Call onStrategyError callback if provided
          if (walkerSchema.callbacks?.onStrategyError) {
            walkerSchema.callbacks.onStrategyError(strategyName, symbol, error);
          }
          continue;
        }

        this.loggerService.info("walkerLogicPrivateService backtest complete", {
          strategyName,
          symbol,
        });

        // Get statistics from BacktestMarkdownService
        const stats = await this.backtestMarkdownService.getData(symbol, strategyName, context.exchangeName, context.frameName, true);

        // Extract metric value
        const value = stats[metric];
        const metricValue =
          value !== null &&
          value !== undefined &&
          typeof value === "number" &&
          !isNaN(value) &&
          isFinite(value)
            ? value
            : null;

        // Update best strategy if needed
        const isBetter =
          bestMetric === null ||
          (metricValue !== null && metricValue > bestMetric);

        if (isBetter && metricValue !== null) {
          bestMetric = metricValue;
          bestStrategy = strategyName;
        }

        strategiesTested++;

        const walkerContract: WalkerContract = {
          walkerName: context.walkerName,
          exchangeName: context.exchangeName,
          frameName: context.frameName,
          symbol,
          strategyName,
          stats,
          metricValue,
          metric,
          bestMetric,
          bestStrategy,
          strategiesTested,
          totalStrategies: strategies.length,
        };

        // Emit progress event
        await progressWalkerEmitter.next({
          walkerName: context.walkerName,
          exchangeName: context.exchangeName,
          frameName: context.frameName,
          symbol,
          totalStrategies: strategies.length,
          processedStrategies: strategiesTested,
          progress: strategies.length > 0 ? strategiesTested / strategies.length : 0,
        });

        // Call onStrategyComplete callback if provided
        if (walkerSchema.callbacks?.onStrategyComplete) {
          await walkerSchema.callbacks.onStrategyComplete(
            strategyName,
            symbol,
            stats,
            metricValue
          );
        }

        await walkerEmitter.next(walkerContract);
        yield walkerContract;
      }
    } finally {
      // Unsubscribe from stop signals by calling destructor
      unsubscribe();
    }

    const finalResults = {
      walkerName: context.walkerName,
      symbol,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      metric,
      totalStrategies: strategies.length,
      bestStrategy,
      bestMetric,
      bestStats:
        bestStrategy !== null
          ? await this.backtestMarkdownService.getData(symbol, bestStrategy, context.exchangeName, context.frameName, true)
          : null,
    };

    // Call onComplete callback if provided with final best results
    if (walkerSchema.callbacks?.onComplete) {
      walkerSchema.callbacks.onComplete(finalResults);
    }

    await walkerCompleteSubject.next(finalResults);
  }
}

export default WalkerLogicPrivateService;
