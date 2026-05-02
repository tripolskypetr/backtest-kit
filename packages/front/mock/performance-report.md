# Performance Report: test-strategy

**Total Events:** 2889 | **Total Duration:** 5847.35 ms

## Backtest Metrics

| Metric | Count | Total (ms) | Avg (ms) | Min (ms) | Max (ms) | StdDev | P95 (ms) | P99 (ms) |
|--------|-------|------------|----------|----------|----------|--------|----------|----------|
| **Total** | 1 | 5847.35 | 5847.35 | 5847.35 | 5847.35 | 0.00 | 5847.35 | 5847.35 |
| **Timeframe** | 1440 | 4320.15 | 3.00 | 0.80 | 52.30 | 4.20 | 12.50 | 28.70 |
| **Signal** | 1440 | 1440.00 | 1.00 | 0.30 | 15.80 | 1.80 | 4.20 | 9.50 |

## Live Metrics

| Metric | Count | Total (ms) | Avg (ms) | Min (ms) | Max (ms) | StdDev | P95 (ms) | P99 (ms) |
|--------|-------|------------|----------|----------|----------|--------|----------|----------|
| **Tick** | 8 | 87.05 | 10.88 | 5.20 | 28.40 | 7.30 | 25.60 | 28.10 |

## Performance Summary

- **Backtest Total Duration:** 5847.35 ms (~5.8 seconds)
- **Average Timeframe Processing:** 3.00 ms
- **Average Signal Processing:** 1.00 ms
- **Average Live Tick:** 10.88 ms
- **Total Timeframes Processed:** 1440
- **Total Signals Processed:** 1440
- **Live Ticks:** 8

## Insights

- Backtest performance is efficient with average timeframe processing at 3ms
- Signal processing is fast with 1ms average duration
- 95th percentile for timeframe processing is 12.5ms (acceptable)
- Live tick performance is stable at ~11ms average
- No significant bottlenecks detected
