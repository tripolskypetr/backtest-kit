---
title: docs/interface/HeatmapStatisticsModel
group: docs
---

# HeatmapStatisticsModel

Portfolio heatmap statistics structure.
Contains aggregated data for all symbols in the portfolio.

## Properties

### symbols

```ts
symbols: IHeatmapRow[]
```

Array of symbol statistics

### totalSymbols

```ts
totalSymbols: number
```

Total number of symbols tracked

### portfolioTotalPnl

```ts
portfolioTotalPnl: number
```

Portfolio-wide total PNL

### portfolioSharpeRatio

```ts
portfolioSharpeRatio: number
```

Portfolio-wide Sharpe Ratio

### portfolioTotalTrades

```ts
portfolioTotalTrades: number
```

Portfolio-wide total trades

### portfolioAvgPeakPnl

```ts
portfolioAvgPeakPnl: number
```

Trade-count-weighted average peak PNL across all symbols. Higher is better.

### portfolioAvgFallPnl

```ts
portfolioAvgFallPnl: number
```

Trade-count-weighted average fall PNL across all symbols. Closer to 0 is better.

### portfolioPeakProfitPnl

```ts
portfolioPeakProfitPnl: number
```

Maximum peak PNL across all trades of all symbols (best best-case). Higher is better.

### portfolioMaxDrawdownPnl

```ts
portfolioMaxDrawdownPnl: number
```

Minimum fall PNL across all trades of all symbols (worst worst-case). Closer to 0 is better.

### portfolioAvgDuration

```ts
portfolioAvgDuration: number
```

Pooled average trade duration in minutes across all trades of all symbols.

### portfolioMedianPnl

```ts
portfolioMedianPnl: number
```

Pooled median pnlPercentage across all trades of all symbols.

### portfolioAvgConsecutiveWinPnl

```ts
portfolioAvgConsecutiveWinPnl: number
```

Trade-count-weighted mean of per-symbol avgConsecutiveWinPnl. Null if no symbol has a win streak.

### portfolioAvgConsecutiveLossPnl

```ts
portfolioAvgConsecutiveLossPnl: number
```

Trade-count-weighted mean of per-symbol avgConsecutiveLossPnl. Null if no symbol has a loss streak.

### portfolioAvgWinDuration

```ts
portfolioAvgWinDuration: number
```

Pooled average duration in minutes of winning trades.

### portfolioAvgLossDuration

```ts
portfolioAvgLossDuration: number
```

Pooled average duration in minutes of losing trades.

### portfolioStdDev

```ts
portfolioStdDev: number
```

Pooled sample standard deviation of returns across all symbols.

### portfolioSortinoRatio

```ts
portfolioSortinoRatio: number
```

Pooled Sortino Ratio over all trades. Same canonical formula as per-symbol.

### portfolioCalmarRatio

```ts
portfolioCalmarRatio: number
```

Pooled Calmar Ratio: pooled compound annual / equity drawdown. Capped at ±MAX_CALMAR_RATIO.

### portfolioRecoveryFactor

```ts
portfolioRecoveryFactor: number
```

Pooled Recovery Factor: (equityFinal-1)*100 / equityMaxDrawdown. Capped at ±MAX_CALMAR_RATIO.

### portfolioExpectancy

```ts
portfolioExpectancy: number
```

Pooled Expectancy: winProb*avgWin + lossProb*avgLoss (per-trade expected %).

### portfolioAnnualizedSharpeRatio

```ts
portfolioAnnualizedSharpeRatio: number
```

Pooled Annualized Sharpe Ratio (portfolioSharpeRatio × √portfolioTradesPerYear). Higher is better.

### portfolioCertaintyRatio

```ts
portfolioCertaintyRatio: number
```

Pooled Certainty Ratio (pooledAvgWin / &vert;pooledAvgLoss|). Higher is better.

### portfolioExpectedYearlyReturns

```ts
portfolioExpectedYearlyReturns: number
```

Pooled expected yearly returns (geometric annualization of pooled equity, capped at ±MAX_EXPECTED_YEARLY_RETURNS).

### portfolioTradesPerYear

```ts
portfolioTradesPerYear: number
```

Pooled observed trade frequency extrapolated to one year.
