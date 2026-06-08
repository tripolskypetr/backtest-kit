---
title: docs/interface/BacktestStatisticsModel
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

Average peak PNL percentage across all signals (_peak.pnlPercentage), null if unsafe. Higher is better.

### avgFallPnl

```ts
avgFallPnl: number
```

Average fall PNL percentage across all signals (_fall.pnlPercentage), null if unsafe. Lower (more negative) means deeper drawdowns.

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

Average trade duration in minutes ((closeTimestamp - pendingAt) / 60_000), null if unsafe.

### medianPnl

```ts
medianPnl: number
```

Median pnlPercentage — robust to outliers; reveals distribution skew when paired with avgPnl.

### avgConsecutiveWinPnl

```ts
avgConsecutiveWinPnl: number
```

Average sum of pnlPercentage across consecutive winning streaks. Null if no win streak.

### avgConsecutiveLossPnl

```ts
avgConsecutiveLossPnl: number
```

Average sum of pnlPercentage across consecutive losing streaks. Null if no loss streak. Closer to 0 is better.

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
