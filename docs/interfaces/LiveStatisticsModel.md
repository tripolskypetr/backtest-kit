---
title: docs/api-reference/interface/LiveStatisticsModel
group: docs
---

# LiveStatisticsModel

Statistical data calculated from live trading results.

All numeric values are null if calculation is unsafe (NaN, Infinity, etc).
Provides comprehensive metrics for live trading performance analysis.

## Properties

### eventList

```ts
eventList: TickEvent[]
```

Array of all events (idle, opened, active, closed) with full details

### totalEvents

```ts
totalEvents: number
```

Total number of all events (includes idle, opened, active, closed)

### totalClosed

```ts
totalClosed: number
```

Total number of closed signals only

### winCount

```ts
winCount: number
```

Number of winning closed signals (PNL &gt; 0)

### lossCount

```ts
lossCount: number
```

Number of losing closed signals (PNL &lt; 0)

### winRate

```ts
winRate: number
```

Win rate as percentage (0-100) based on closed signals, null if unsafe. Higher is better.

### avgPnl

```ts
avgPnl: number
```

Average PNL per closed signal as percentage, null if unsafe. Higher is better.

### totalPnl

```ts
totalPnl: number
```

Cumulative PNL across all closed signals as percentage, null if unsafe. Higher is better.

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
