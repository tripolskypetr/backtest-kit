import {
  PerformanceContract,
  PerformanceMetricType,
} from "../contract/Performance.contract";

/**
 * Aggregated statistics for a specific metric type.
 */
export interface MetricStats {
  /** Type of metric */
  metricType: PerformanceMetricType;

  /** Number of recorded samples */
  count: number;

  /** Total duration across all samples (ms) */
  totalDuration: number;

  /** Average duration (ms) */
  avgDuration: number;

  /** Minimum duration (ms) */
  minDuration: number;

  /** Maximum duration (ms) */
  maxDuration: number;

  /** Standard deviation of duration (ms) */
  stdDev: number;

  /** Median duration (ms) */
  median: number;

  /** 95th percentile duration (ms) */
  p95: number;

  /** 99th percentile duration (ms) */
  p99: number;

  /** Average wait time between events (ms) */
  avgWaitTime: number;

  /** Minimum wait time between events (ms) */
  minWaitTime: number;

  /** Maximum wait time between events (ms) */
  maxWaitTime: number;
}

/**
 * Performance statistics aggregated by strategy.
 */
export interface PerformanceStatisticsModel {
  /** Strategy name */
  strategyName: string;

  /** Total number of performance events recorded */
  totalEvents: number;

  /** Total execution time across all metrics (ms) */
  totalDuration: number;

  /** Statistics grouped by metric type */
  metricStats: Record<string, MetricStats>;

  /** All raw performance events */
  events: PerformanceContract[];
}
