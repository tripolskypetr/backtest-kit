import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import {
  IWalkerResults,
  IWalkerStrategyResult,
  WalkerMetric,
} from "../../../../interfaces/Walker.interface";
import { StrategyName } from "../../../../interfaces/Strategy.interface";
import BacktestLogicPublicService from "../public/BacktestLogicPublicService";
import BacktestMarkdownService, {
  BacktestStatistics,
} from "../../markdown/BacktestMarkdownService";

/**
 * Extracts metric value from backtest statistics.
 *
 * @param stats - Backtest statistics
 * @param metric - Metric to extract
 * @returns Metric value (null if invalid/NaN/Infinity)
 */
const GET_METRIC_FN = async (
  stats: BacktestStatistics,
  metric: WalkerMetric
): Promise<number | null> => {
  const value = stats[metric];

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number") {
    return null;
  }

  if (isNaN(value) || !isFinite(value)) {
    return null;
  }

  return value;
};

/**
 * Private service for walker orchestration (strategy comparison).
 *
 * Flow:
 * 1. Get list of strategies to compare from walker schema
 * 2. For each strategy: run full backtest and collect statistics
 * 3. Extract metric value from each strategy's statistics
 * 4. Sort strategies by metric value (descending)
 * 5. Return comparison results with rankings
 *
 * Uses BacktestLogicPrivateService internally for each strategy.
 */
export class WalkerLogicPrivateService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly backtestLogicPublicService =
    inject<BacktestLogicPublicService>(TYPES.backtestLogicPublicService);
  private readonly backtestMarkdownService = inject<BacktestMarkdownService>(
    TYPES.backtestMarkdownService
  );

  /**
   * Runs walker comparison for a symbol.
   *
   * Executes backtest for each strategy sequentially and compares results.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategies - List of strategy names to compare
   * @param metric - Metric to use for comparison
   * @param context - Walker context with exchangeName, frameName, walkerName
   * @returns Walker results with rankings
   *
   * @example
   * ```typescript
   * const results = await walkerLogic.run(
   *   "BTCUSDT",
   *   ["strategy-v1", "strategy-v2"],
   *   "sharpeRatio",
   *   {
   *     exchangeName: "binance",
   *     frameName: "1d-backtest",
   *     walkerName: "my-optimizer"
   *   }
   * );
   * console.log("Best strategy:", results.bestStrategy);
   * console.log("Best Sharpe:", results.bestMetric);
   * ```
   */
  public async run(
    symbol: string,
    strategies: StrategyName[],
    metric: WalkerMetric,
    context: {
      exchangeName: string;
      frameName: string;
      walkerName: string;
    }
  ): Promise<IWalkerResults> {
    this.loggerService.log("walkerLogicPrivateService run", {
      symbol,
      strategies,
      metric,
      context,
    });

    const results: IWalkerStrategyResult[] = [];

    // Run backtest for each strategy
    for (const strategyName of strategies) {
      this.loggerService.info("walkerLogicPrivateService testing strategy", {
        strategyName,
        symbol,
      });

      // Run backtest using public service (handles context automatically)
      const closedSignals = [];
      for await (const result of this.backtestLogicPublicService.run(symbol, {
        strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
      })) {
        closedSignals.push(result);
      }

      this.loggerService.info("walkerLogicPrivateService backtest complete", {
        strategyName,
        symbol,
        signalsCount: closedSignals.length,
      });

      // Get statistics from BacktestMarkdownService
      const stats = await this.backtestMarkdownService.getData(strategyName);

      // Extract metric value
      const metricValue = await GET_METRIC_FN(stats, metric);

      this.loggerService.info("walkerLogicPrivateService metric extracted", {
        strategyName,
        metric,
        metricValue,
      });

      results.push({
        strategyName,
        stats,
        metric: metricValue,
        rank: 0, // Will be assigned after sorting
      });
    }

    // Sort by metric (descending - higher is better)
    results.sort((a, b) => {
      // Handle null values (put them last)
      if (a.metric === null && b.metric === null) return 0;
      if (a.metric === null) return 1;
      if (b.metric === null) return -1;

      return b.metric - a.metric;
    });

    // Assign ranks
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    // Get best result
    const bestResult = results[0];

    const walkerResults: IWalkerResults = {
      walkerName: context.walkerName,
      symbol,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      metric,
      totalStrategies: strategies.length,
      bestStrategy: bestResult.strategyName,
      bestMetric: bestResult.metric,
      bestStats: bestResult.stats,
      allResults: results,
    };

    this.loggerService.info("walkerLogicPrivateService run complete", {
      walkerName: walkerResults.walkerName,
      bestStrategy: walkerResults.bestStrategy,
      bestMetric: walkerResults.bestMetric,
    });

    return walkerResults;
  }
}

export default WalkerLogicPrivateService;
