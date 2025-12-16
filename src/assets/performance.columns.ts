import { ColumnModel } from "../model/Column.model";
import { MetricStats } from "../model/PerformanceStatistics.model";

export const performance_columns: ColumnModel<MetricStats>[] = [
  {
    key: "metricType",
    label: "Metric Type",
    format: (data) => data.metricType,
    isVisible: () => true,
  },
  {
    key: "count",
    label: "Count",
    format: (data) => data.count.toString(),
    isVisible: () => true,
  },
  {
    key: "totalDuration",
    label: "Total (ms)",
    format: (data) => data.totalDuration.toFixed(2),
    isVisible: () => true,
  },
  {
    key: "avgDuration",
    label: "Avg (ms)",
    format: (data) => data.avgDuration.toFixed(2),
    isVisible: () => true,
  },
  {
    key: "minDuration",
    label: "Min (ms)",
    format: (data) => data.minDuration.toFixed(2),
    isVisible: () => true,
  },
  {
    key: "maxDuration",
    label: "Max (ms)",
    format: (data) => data.maxDuration.toFixed(2),
    isVisible: () => true,
  },
  {
    key: "stdDev",
    label: "Std Dev (ms)",
    format: (data) => data.stdDev.toFixed(2),
    isVisible: () => true,
  },
  {
    key: "median",
    label: "Median (ms)",
    format: (data) => data.median.toFixed(2),
    isVisible: () => true,
  },
  {
    key: "p95",
    label: "P95 (ms)",
    format: (data) => data.p95.toFixed(2),
    isVisible: () => true,
  },
  {
    key: "p99",
    label: "P99 (ms)",
    format: (data) => data.p99.toFixed(2),
    isVisible: () => true,
  },
  {
    key: "avgWaitTime",
    label: "Avg Wait (ms)",
    format: (data) => data.avgWaitTime.toFixed(2),
    isVisible: () => true,
  },
  {
    key: "minWaitTime",
    label: "Min Wait (ms)",
    format: (data) => data.minWaitTime.toFixed(2),
    isVisible: () => true,
  },
  {
    key: "maxWaitTime",
    label: "Max Wait (ms)",
    format: (data) => data.maxWaitTime.toFixed(2),
    isVisible: () => true,
  },
];
