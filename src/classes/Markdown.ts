import { compose } from "functools-kit";
import backtest from "src/lib";

const MARKDOWN_METHOD_NAME_ENABLE = "MarkdownUtils.enable";

/**
 * Configuration interface for selective markdown service enablement.
 *
 * Controls which markdown report services should be activated.
 * Each property corresponds to a specific markdown service type.
 *
 * @property backtest - Enable backtest markdown reports (main strategy results)
 * @property breakeven - Enable breakeven event tracking reports
 * @property partial - Enable partial profit/loss event reports
 * @property heat - Enable heatmap portfolio analysis reports
 * @property walker - Enable walker optimization comparison reports
 * @property performance - Enable performance metrics and bottleneck analysis
 * @property risk - Enable risk rejection tracking reports
 * @property schedule - Enable scheduled signal tracking reports
 * @property live - Enable live trading event reports
 */
interface IMarkdownTarget {
  risk: boolean;
  breakeven: boolean;
  partial: boolean;
  heat: boolean;
  walker: boolean;
  performance: boolean;
  schedule: boolean;
  live: boolean;
  backtest: boolean;
}

/**
 * Default configuration that enables all markdown services.
 * Used when no specific configuration is provided to `enable()`.
 */
const WILDCARD_TARGET: IMarkdownTarget = {
  backtest: true,
  breakeven: true,
  heat: true,
  live: true,
  partial: true,
  performance: true,
  risk: true,
  schedule: true,
  walker: true,
};

/**
 * MarkdownUtils class provides centralized control for markdown report services.
 *
 * Manages subscription lifecycle for all markdown services, allowing selective
 * activation of report generation and automatic cleanup of resources.
 *
 * Features:
 * - Selective service activation (choose which reports to generate)
 * - Automatic subscription management
 * - Single unsubscribe function for all services
 * - Prevention of multiple subscriptions
 * - Memory leak prevention through proper cleanup
 *
 * @example
 * ```typescript
 * import { Markdown } from "backtest-kit";
 *
 * // Enable all markdown services
 * const unsubscribe = Markdown.enable();
 *
 * // Run backtest...
 *
 * // Cleanup when done
 * unsubscribe();
 * ```
 *
 * @example
 * ```typescript
 * import { Markdown } from "backtest-kit";
 *
 * // Enable only specific services
 * const unsubscribe = Markdown.enable({
 *   backtest: true,
 *   performance: true,
 *   heat: true
 * });
 *
 * // Run backtest...
 * // Only backtest, performance, and heat reports will be generated
 *
 * // Cleanup
 * unsubscribe();
 * ```
 *
 * @example
 * ```typescript
 * import { Markdown } from "backtest-kit";
 *
 * // Use in lifecycle hooks
 * async function runBacktest() {
 *   const unsubscribe = Markdown.enable();
 *
 *   try {
 *     // Run backtest
 *     await bt.backtest(...);
 *   } finally {
 *     // Always cleanup
 *     unsubscribe();
 *   }
 * }
 * ```
 */
export class MarkdownUtils {
  /**
   * Enables markdown report services selectively.
   *
   * Subscribes to specified markdown services and returns a cleanup function
   * that unsubscribes from all enabled services at once.
   *
   * Each enabled service will:
   * - Start listening to relevant events
   * - Accumulate data for reports
   * - Generate markdown files when requested
   *
   * IMPORTANT: Always call the returned unsubscribe function to prevent memory leaks.
   *
   * @param config - Service configuration object. Defaults to enabling all services.
   * @param config.backtest - Enable backtest result reports with full trade history
   * @param config.breakeven - Enable breakeven event tracking (when stop loss moves to entry)
   * @param config.partial - Enable partial profit/loss event tracking
   * @param config.heat - Enable portfolio heatmap analysis across all symbols
   * @param config.walker - Enable walker strategy comparison and optimization reports
   * @param config.performance - Enable performance bottleneck analysis
   * @param config.risk - Enable risk rejection tracking (signals blocked by risk limits)
   * @param config.schedule - Enable scheduled signal tracking (signals waiting for trigger)
   * @param config.live - Enable live trading event reports (all tick events)
   *
   * @returns Cleanup function that unsubscribes from all enabled services
   *
   * @example
   * ```typescript
   * // Enable all services (default behavior)
   * const unsubscribe = Markdown.enable();
   *
   * // Run backtest
   * await bt.backtest(...);
   *
   * // Generate reports
   * await bt.Backtest.dump("BTCUSDT", "my-strategy");
   * await bt.Performance.dump("BTCUSDT", "my-strategy");
   *
   * // Cleanup
   * unsubscribe();
   * ```
   *
   * @example
   * ```typescript
   * // Enable only essential services
   * const unsubscribe = Markdown.enable({
   *   backtest: true,    // Main results
   *   performance: true, // Bottlenecks
   *   risk: true        // Rejections
   * });
   *
   * // Other services (breakeven, partial, heat, etc.) won't collect data
   * ```
   *
   * @example
   * ```typescript
   * // Safe cleanup pattern
   * let unsubscribe: Function;
   *
   * try {
   *   unsubscribe = Markdown.enable({
   *     backtest: true,
   *     heat: true
   *   });
   *
   *   await bt.backtest(...);
   *   await bt.Backtest.dump("BTCUSDT", "my-strategy");
   * } finally {
   *   unsubscribe?.();
   * }
   * ```
   */
  public enable = ({
    backtest: bt = false,
    breakeven = false,
    heat = false,
    live = false,
    partial = false,
    performance = false,
    risk = false,
    schedule = false,
    walker = false,
  }: Partial<IMarkdownTarget> = WILDCARD_TARGET) => {
    backtest.loggerService.debug(MARKDOWN_METHOD_NAME_ENABLE, {
      backtest: bt,
      breakeven,
      heat,
      live,
      partial,
      performance,
      risk,
      schedule,
      walker,
    });
    const unList: Function[] = [];
    if (bt) {
      unList.push(backtest.backtestMarkdownService.subscribe());
    }
    if (breakeven) {
      unList.push(backtest.breakevenMarkdownService.subscribe());
    }
    if (heat) {
      unList.push(backtest.heatMarkdownService.subscribe());
    }
    if (live) {
      unList.push(backtest.liveMarkdownService.subscribe());
    }
    if (partial) {
      unList.push(backtest.partialMarkdownService.subscribe());
    }
    if (performance) {
      unList.push(backtest.performanceMarkdownService.subscribe());
    }
    if (risk) {
      unList.push(backtest.riskMarkdownService.subscribe());
    }
    if (schedule) {
      unList.push(backtest.scheduleMarkdownService.subscribe());
    }
    if (walker) {
      unList.push(backtest.walkerMarkdownService.subscribe());
    }
    return compose(...unList.map((un) => () => void un()));
  };
}

/**
 * Singleton instance of MarkdownUtils for markdown service management.
 *
 * Provides centralized control over all markdown report generation services.
 * Use this instance to enable/disable markdown services throughout your application.
 *
 * @example
 * ```typescript
 * import { Markdown } from "backtest-kit";
 *
 * // Enable markdown services before backtesting
 * const unsubscribe = Markdown.enable();
 *
 * // Run your backtest
 * await bt.backtest(...);
 *
 * // Generate reports
 * await bt.Backtest.dump("BTCUSDT", "my-strategy");
 *
 * // Cleanup
 * unsubscribe();
 * ```
 *
 * @see MarkdownUtils for detailed API documentation
 */
export const Markdown = new MarkdownUtils();
