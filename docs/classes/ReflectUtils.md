---
title: docs/class/ReflectUtils
group: docs
---

# ReflectUtils

Utility class for real-time position reflection: PNL, peak profit, and drawdown queries.

Provides unified access to strategyCoreService position state methods with logging
and full validation (strategy, exchange, frame, risk, actions).
Works for both live and backtest modes via the `backtest` parameter.
Exported as singleton instance for convenient usage.

## Constructor

```ts
constructor();
```

## Properties

### getPositionPnlPercent

```ts
getPositionPnlPercent: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the unrealized PNL percentage for the current pending signal at currentPrice.

Accounts for partial closes, DCA entries, slippage and fees.
Returns null if no pending signal exists.

### getPositionPnlCost

```ts
getPositionPnlCost: (symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the unrealized PNL in dollars for the current pending signal at currentPrice.

Calculated as: pnlPercentage / 100 × totalInvestedCost.
Accounts for partial closes, DCA entries, slippage and fees.
Returns null if no pending signal exists.

### getPositionHighestProfitPrice

```ts
getPositionHighestProfitPrice: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the best price reached in the profit direction during this position's life.

Returns null if no pending signal exists.

### getPositionHighestProfitTimestamp

```ts
getPositionHighestProfitTimestamp: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the timestamp when the best profit price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestPnlPercentage

```ts
getPositionHighestPnlPercentage: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the PnL percentage at the moment the best profit price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestPnlCost

```ts
getPositionHighestPnlCost: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the PnL cost (in quote currency) at the moment the best profit price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestProfitBreakeven

```ts
getPositionHighestProfitBreakeven: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<boolean>
```

Returns whether breakeven was mathematically reachable at the highest profit price.

Returns null if no pending signal exists.

### getPositionActiveMinutes

```ts
getPositionActiveMinutes: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the number of minutes the position has been active since it opened.

Returns null if no pending signal exists.

### getPositionWaitingMinutes

```ts
getPositionWaitingMinutes: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the number of minutes the scheduled signal has been waiting for activation.

Returns null if no scheduled signal exists.

### getPositionDrawdownMinutes

```ts
getPositionDrawdownMinutes: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the number of minutes elapsed since the highest profit price was recorded.

Returns null if no pending signal exists.

### getPositionHighestProfitMinutes

```ts
getPositionHighestProfitMinutes: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the number of minutes elapsed since the highest profit price was recorded.

Alias for getPositionDrawdownMinutes — measures how long the position has been
pulling back from its peak profit level.
Returns null if no pending signal exists.

### getPositionMaxDrawdownMinutes

```ts
getPositionMaxDrawdownMinutes: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the number of minutes elapsed since the worst loss price was recorded.

Measures how long ago the deepest drawdown point occurred.
Zero when called at the exact moment the trough was set.
Returns null if no pending signal exists.

### getPositionMaxDrawdownPrice

```ts
getPositionMaxDrawdownPrice: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the worst price reached in the loss direction during this position's life.

Returns null if no pending signal exists.

### getPositionMaxDrawdownTimestamp

```ts
getPositionMaxDrawdownTimestamp: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the timestamp when the worst loss price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionMaxDrawdownPnlPercentage

```ts
getPositionMaxDrawdownPnlPercentage: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the PnL percentage at the moment the worst loss price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionMaxDrawdownPnlCost

```ts
getPositionMaxDrawdownPnlCost: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the PnL cost (in quote currency) at the moment the worst loss price was recorded during this position's life.

Returns null if no pending signal exists.

### getPositionHighestProfitDistancePnlPercentage

```ts
getPositionHighestProfitDistancePnlPercentage: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the distance in PnL percentage between the current price and the highest profit peak.

Result is ≥ 0. Returns null if no pending signal exists.

### getPositionHighestProfitDistancePnlCost

```ts
getPositionHighestProfitDistancePnlCost: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the distance in PnL cost between the current price and the highest profit peak.

Result is ≥ 0. Returns null if no pending signal exists.

### getPositionHighestMaxDrawdownPnlPercentage

```ts
getPositionHighestMaxDrawdownPnlPercentage: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the distance in PnL percentage between the current price and the worst drawdown trough.

Result is ≥ 0. Returns null if no pending signal exists.

### getPositionHighestMaxDrawdownPnlCost

```ts
getPositionHighestMaxDrawdownPnlCost: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the distance in PnL cost between the current price and the worst drawdown trough.

Result is ≥ 0. Returns null if no pending signal exists.

### getMaxDrawdownDistancePnlPercentage

```ts
getMaxDrawdownDistancePnlPercentage: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the peak-to-trough PnL percentage distance between the position's highest profit and deepest drawdown.

Result is ≥ 0. Returns null if no pending signal exists.

### getMaxDrawdownDistancePnlCost

```ts
getMaxDrawdownDistancePnlCost: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<number>
```

Returns the peak-to-trough PnL cost distance between the position's highest profit and deepest drawdown.

Result is ≥ 0. Returns null if no pending signal exists.
