---
title: docs/api-reference/interface/BacktestStatisticsModel
group: docs
---

# BacktestStatisticsModel

Statistical data calculated from backtest results.

All numeric values are null if calculation is unsafe (NaN, Infinity, etc).
Provides comprehensive metrics for strategy performance analysis.

## Properties

### signalList

```ts
signalList: IStrategyTickResultClosed[]
```

Array of all closed signals with full details (price, PNL, timestamps, etc.)

### totalSignals

```ts
totalSignals: number
```

Total number of closed signals

### winCount

```ts
winCount: number
```

Number of winning signals (PNL &gt; 0)

### lossCount

```ts
lossCount: number
```

Number of losing signals (PNL &lt; 0)

### winRate

```ts
winRate: number
```

Win rate as percentage (0-100), null if unsafe. Higher is better.

### avgPnl

```ts
avgPnl: number
```

Average PNL per signal as percentage, null if unsafe. Higher is better.

### totalPnl

```ts
totalPnl: number
```

Cumulative PNL across all signals as percentage, null if unsafe. Higher is better.

### stdDev

```ts
stdDev: number
```

Standard deviation of returns (volatility metric), null if unsafe. Lower is better.

### sharpeRatio

```ts
sharpeRatio: number
```

Sharpe Ratio (risk-adjusted return = avgPnl / stdDev), null if unsafe. Higher is better.

### annualizedSharpeRatio

```ts
annualizedSharpeRatio: number
```

Annualized Sharpe Ratio (sharpeRatio × √365), null if unsafe. Higher is better.

### certaintyRatio

```ts
certaintyRatio: number
```

Certainty Ratio (avgWin / &vert;avgLoss|), null if unsafe. Higher is better.

### expectedYearlyReturns

```ts
expectedYearlyReturns: number
```

Expected yearly returns based on average trade duration and PNL, null if unsafe. Higher is better.
