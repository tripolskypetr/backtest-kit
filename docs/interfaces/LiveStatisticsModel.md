---
title: docs/interface/LiveStatisticsModel
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

Annualized Sharpe Ratio (sharpeRatio × √tradesPerYear), null if unsafe. Higher is better.

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

### avgPeakPnl

```ts
avgPeakPnl: number
```

Average peak PNL percentage across all closed signals (_peak.pnlPercentage), null if unsafe. Higher is better.

### avgFallPnl

```ts
avgFallPnl: number
```

Average fall PNL percentage across all closed signals (_fall.pnlPercentage), null if unsafe. Closer to 0 is better.

### sortinoRatio

```ts
sortinoRatio: number
```

Sortino Ratio (avgPnl / downside deviation — RMS of losing trades only), null if unsafe. Higher is better.

### calmarRatio

```ts
calmarRatio: number
```

Calmar Ratio (annualized expected return / max drawdown), null if unsafe. Higher is better.

### recoveryFactor

```ts
recoveryFactor: number
```

Recovery Factor (totalPnl / max drawdown), null if unsafe. Higher is better.

### expectancy

```ts
expectancy: number
```

Per-trade Expectancy (winProb*avgWin + lossProb*avgLoss), null if unsafe. Higher is better.

### avgDuration

```ts
avgDuration: number
```

Average trade duration in minutes ((timestamp - pendingAt) / 60_000), null if unsafe.

### medianPnl

```ts
medianPnl: number
```

Median pnl — robust to outliers; reveals distribution skew when paired with avgPnl.

### avgConsecutiveWinPnl

```ts
avgConsecutiveWinPnl: number
```

Average sum of pnl across consecutive winning streaks. Null if no win streak.

### avgConsecutiveLossPnl

```ts
avgConsecutiveLossPnl: number
```

Average sum of pnl across consecutive losing streaks. Null if no loss streak. Closer to 0 is better.

### avgWinDuration

```ts
avgWinDuration: number
```

Average duration in minutes of winning trades.

### avgLossDuration

```ts
avgLossDuration: number
```

Average duration in minutes of losing trades.

### medianStepSize

```ts
medianStepSize: number
```

Median &vert;close[i] - close[i-1]| / close[i-1] across trade closes, in %. Robust to outliers.

### buyerPressure

```ts
buyerPressure: number
```

Fraction of up-moves among decisive close-to-close moves. 0..1. Higher = buyers more frequent.

### sellerPressure

```ts
sellerPressure: number
```

Fraction of down-moves among decisive moves. 0..1. Equals 1 - buyerPressure.

### buyerStrength

```ts
buyerStrength: number
```

Share of upward absolute movement in total close-to-close movement. 0..1.

### sellerStrength

```ts
sellerStrength: number
```

Share of downward absolute movement in total close-to-close movement. 0..1.

### pressureImbalance

```ts
pressureImbalance: number
```

buyerStrength - sellerStrength ∈ [-1, 1]. Positive = bullish bias on magnitude.

### trend

```ts
trend: "bullish" | "bearish" | "sideways" | "neutral"
```

Bivariate trend classification (slope × R²).

### trendStrength

```ts
trendStrength: number
```

Log-price regression slope, in %/day.

### trendConfidence

```ts
trendConfidence: number
```

R² of the log-price regression, in [0, 1].
