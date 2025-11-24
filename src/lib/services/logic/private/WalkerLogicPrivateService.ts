import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import { WalkerMetric } from "../../../../interfaces/Walker.interface";
import { StrategyName } from "../../../../interfaces/Strategy.interface";
import BacktestLogicPublicService from "../public/BacktestLogicPublicService";
import BacktestMarkdownService from "../../markdown/BacktestMarkdownService";
import { WalkerContract } from "../../../../contract/Walker.contract";
import { walkerEmitter } from "../../../../config/emitters";
import { resolveDocuments } from "functools-kit";

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
  private readonly backtestMarkdownService =
    inject<BacktestMarkdownService>(TYPES.backtestMarkdownService);

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

    let strategiesTested = 0;
    let bestMetric: number | null = null;
    let bestStrategy: StrategyName | null = null;

    // Run backtest for each strategy
    for (const strategyName of strategies) {
      this.loggerService.info("walkerLogicPrivateService testing strategy", {
        strategyName,
        symbol,
      });

      const iterator = this.backtestLogicPublicService.run(symbol, {
        strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
      });

      await resolveDocuments(iterator);

      this.loggerService.info("walkerLogicPrivateService backtest complete", {
        strategyName,
        symbol,
      });

      // Get statistics from BacktestMarkdownService
      const stats = await this.backtestMarkdownService.getData(strategyName);

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

      await walkerEmitter.next(walkerContract);
      yield walkerContract;
    }
  }

}

export default WalkerLogicPrivateService;
