import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { IWalkerResults } from "../../../interfaces/Walker.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { str } from "functools-kit";

/**
 * Checks if a value is unsafe for display (not a number, NaN, or Infinity).
 */
function isUnsafe(value: number | null): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value !== "number") {
    return true;
  }
  if (isNaN(value)) {
    return true;
  }
  if (!isFinite(value)) {
    return true;
  }
  return false;
}

/**
 * Formats a metric value for display.
 * Returns "N/A" for unsafe values, otherwise formats with 2 decimal places.
 */
function formatMetric(value: number | null): string {
  if (isUnsafe(value)) {
    return "N/A";
  }
  return value!.toFixed(2);
}

/**
 * Service for generating walker comparison reports.
 *
 * Features:
 * - Generates markdown reports comparing strategies
 * - Shows rankings, metrics, and detailed statistics
 * - Saves reports to disk in logs/walker/{walkerName}.md
 *
 * @example
 * ```typescript
 * const markdown = await walkerMarkdownService.getReport(results);
 * await walkerMarkdownService.dump(results);
 * ```
 */
export class WalkerMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Generates markdown report from walker results.
   *
   * @param results - Walker comparison results
   * @returns Markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await walkerMarkdownService.getReport(results);
   * console.log(markdown);
   * ```
   */
  public async getReport(results: IWalkerResults): Promise<string> {
    this.loggerService.log("walkerMarkdownService getReport", {
      walkerName: results.walkerName,
    });

    // Summary header
    const summaryHeader = [
      "Rank",
      "Strategy Name",
      `${results.metric}`,
      "Win Rate (%)",
      "Total PNL (%)",
      "Avg PNL (%)",
      "Total Signals",
      "Win/Loss",
    ];

    const summarySeparator = summaryHeader.map(() => "---");

    const summaryRows = results.allResults.map((result) => [
      result.rank.toString(),
      result.strategyName,
      formatMetric(result.metric),
      formatMetric(result.stats.winRate),
      formatMetric(result.stats.totalPnl),
      formatMetric(result.stats.avgPnl),
      result.stats.totalSignals.toString(),
      `${result.stats.winCount}W / ${result.stats.lossCount}L`,
    ]);

    const summaryTableData = [summaryHeader, summarySeparator, ...summaryRows];
    const summaryTable = str.newline(
      summaryTableData.map((row) => `| ${row.join(" | ")} |`)
    );

    // Detailed metrics for best strategy
    const best = results.bestStats;
    const bestMetrics = [
      `**Total Signals:** ${best.totalSignals}`,
      `**Win Rate:** ${formatMetric(best.winRate)}% (${best.winCount}W / ${best.lossCount}L) (higher is better)`,
      `**Average PNL:** ${formatMetric(best.avgPnl)}% (higher is better)`,
      `**Total PNL:** ${formatMetric(best.totalPnl)}% (higher is better)`,
      `**Standard Deviation:** ${formatMetric(best.stdDev)}% (lower is better)`,
      `**Sharpe Ratio:** ${formatMetric(best.sharpeRatio)} (higher is better)`,
      `**Annualized Sharpe Ratio:** ${formatMetric(best.annualizedSharpeRatio)} (higher is better)`,
      `**Certainty Ratio:** ${formatMetric(best.certaintyRatio)} (higher is better)`,
      `**Expected Yearly Returns:** ${formatMetric(best.expectedYearlyReturns)} trades (higher is better)`,
    ];

    return str.newline(
      `# Walker Comparison Report: ${results.walkerName}`,
      "",
      `**Symbol:** ${results.symbol}`,
      `**Exchange:** ${results.exchangeName}`,
      `**Frame:** ${results.frameName}`,
      `**Optimization Metric:** ${results.metric}`,
      `**Strategies Tested:** ${results.totalStrategies}`,
      "",
      "## Results Summary",
      "",
      summaryTable,
      "",
      `## Best Strategy: ${results.bestStrategy}`,
      "",
      `**Best ${results.metric}:** ${formatMetric(results.bestMetric)}`,
      "",
      str.newline(bestMetrics),
      "",
      "**Note:** Higher values are better for all metrics except Standard Deviation (lower is better)."
    );
  }

  /**
   * Saves walker report to disk.
   *
   * @param results - Walker comparison results
   * @param path - Directory path to save report
   *
   * @example
   * ```typescript
   * // Save to default path: ./logs/walker/my-walker.md
   * await walkerMarkdownService.dump(results);
   *
   * // Save to custom path
   * await walkerMarkdownService.dump(results, "./custom/path");
   * ```
   */
  public async dump(
    results: IWalkerResults,
    path = "./logs/walker"
  ): Promise<void> {
    this.loggerService.log("walkerMarkdownService dump", {
      walkerName: results.walkerName,
      path,
    });

    const markdown = await this.getReport(results);

    try {
      const dir = join(process.cwd(), path);
      await mkdir(dir, { recursive: true });

      const filename = `${results.walkerName}.md`;
      const filepath = join(dir, filename);

      await writeFile(filepath, markdown, "utf-8");
      console.log(`Walker report saved: ${filepath}`);
    } catch (error) {
      console.error(`Failed to save walker report:`, error);
    }
  }
}

export default WalkerMarkdownService;
