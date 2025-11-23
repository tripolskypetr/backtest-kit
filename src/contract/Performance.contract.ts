/**
 * Performance metric types tracked by the system.
 *
 * Backtest metrics:
 * - backtest_total: Total backtest duration from start to finish
 * - backtest_timeframe: Duration to process a single timeframe iteration
 * - backtest_signal: Duration to process a signal (tick + getNextCandles + backtest)
 *
 * Live metrics:
 * - live_tick: Duration of a single live tick iteration
 */
export type PerformanceMetricType =
  | "backtest_total"     // Total backtest duration
  | "backtest_timeframe" // Single timeframe processing
  | "backtest_signal"    // Signal processing (tick + getNextCandles + backtest)
  | "live_tick";         // Single live tick duration

/**
 * Contract for performance tracking events.
 *
 * Emitted during execution to track performance metrics for various operations.
 * Useful for profiling and identifying bottlenecks.
 *
 * @example
 * ```typescript
 * import { listenPerformance } from "backtest-kit";
 *
 * listenPerformance((event) => {
 *   console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
 *   console.log(`${event.strategyName} @ ${event.exchangeName}`);
 * });
 * ```
 */
export interface PerformanceContract {
  /** Timestamp when the metric was recorded (milliseconds since epoch) */
  timestamp: number;

  /** Type of operation being measured */
  metricType: PerformanceMetricType;

  /** Duration of the operation in milliseconds */
  duration: number;

  /** Strategy name associated with this metric */
  strategyName: string;

  /** Exchange name associated with this metric */
  exchangeName: string;

  /** Trading symbol associated with this metric */
  symbol: string;

  /** Whether this metric is from backtest mode (true) or live mode (false) */
  backtest: boolean;
}

export default PerformanceContract;
