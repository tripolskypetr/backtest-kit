---
title: docs/interface/IHeatmapRow
group: docs
---

# IHeatmapRow

Portfolio heatmap statistics for a single symbol.
Aggregated metrics across all strategies for one trading pair.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### totalPnl

```ts
totalPnl: number
```

Total profit/loss percentage across all closed trades

### sharpeRatio

```ts
sharpeRatio: number
```

Risk-adjusted return per trade (Sharpe Ratio = avgPnl / stdDev)

### maxDrawdown

```ts
maxDrawdown: number
```

Maximum drawdown percentage (largest peak-to-trough decline)

### totalTrades

```ts
totalTrades: number
```

Total number of closed trades

### winCount

```ts
winCount: number
```

Number of winning trades

### lossCount

```ts
lossCount: number
```

Number of losing trades

### winRate

```ts
winRate: number
```

Win rate percentage

### avgPnl

```ts
avgPnl: number
```

Average PNL per trade

### stdDev

```ts
stdDev: number
```

Standard deviation of PNL

### profitFactor

```ts
profitFactor: number
```

Profit factor: sum of wins / sum of losses

### avgWin

```ts
avgWin: number
```

Average profit percentage on winning trades

### avgLoss

```ts
avgLoss: number
```

Average loss percentage on losing trades

### maxWinStreak

```ts
maxWinStreak: number
```

Maximum consecutive winning trades

### maxLossStreak

```ts
maxLossStreak: number
```

Maximum consecutive losing trades

### expectancy

```ts
expectancy: number
```

Expectancy: (winRate * avgWin) - (lossRate * avgLoss)

### avgPeakPnl

```ts
avgPeakPnl: number
```

Average peak PNL percentage across all trades (_peak.pnlPercentage). Higher is better.

### avgFallPnl

```ts
avgFallPnl: number
```

Average fall PNL percentage across all trades (_fall.pnlPercentage). Closer to 0 is better.

### peakProfitPnl

```ts
peakProfitPnl: number
```

Maximum peak PNL percentage observed across all trades (best best-case). Higher is better.

### maxDrawdownPnl

```ts
maxDrawdownPnl: number
```

Minimum fall PNL percentage observed across all trades (worst worst-case). Closer to 0 is better.

### avgDuration

```ts
avgDuration: number
```

Average trade duration in minutes ((closeTimestamp - pendingAt) / 60_000).

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

### sortinoRatio

```ts
sortinoRatio: number
```

Sortino Ratio (avgPnl / downside deviation — RMS of losing trades only). Higher is better.

### calmarRatio

```ts
calmarRatio: number
```

Calmar Ratio (totalPnl / maxDrawdown). Higher is better.

### recoveryFactor

```ts
recoveryFactor: number
```

Recovery Factor (totalPnl / maxDrawdown). Higher is better.

### annualizedSharpeRatio

```ts
annualizedSharpeRatio: number
```

Annualized Sharpe Ratio (sharpeRatio × √tradesPerYear). Higher is better.

### certaintyRatio

```ts
certaintyRatio: number
```

Certainty Ratio (avgWin / &vert;avgLoss|). Higher is better.

### expectedYearlyReturns

```ts
expectedYearlyReturns: number
```

Expected yearly returns (geometric, capped at ±MAX_EXPECTED_YEARLY_RETURNS). Higher is better.

### tradesPerYear

```ts
tradesPerYear: number
```

Observed trade frequency extrapolated to one year (signals × 365 / calendarSpanDays).

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
