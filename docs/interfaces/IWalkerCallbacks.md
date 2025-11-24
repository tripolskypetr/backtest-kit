---
title: docs/api-reference/interface/IWalkerCallbacks
group: docs
---

# IWalkerCallbacks

Optional lifecycle callbacks for walker events.
Called during strategy comparison process.

## Properties

### onStrategyStart

```ts
onStrategyStart: (strategyName: string, symbol: string) => void
```

Called when starting to test a specific strategy

### onStrategyComplete

```ts
onStrategyComplete: (strategyName: string, symbol: string, stats: BacktestStatistics, metric: number) => void
```

Called when a strategy backtest completes

### onComplete

```ts
onComplete: (results: IWalkerResults) => void
```

Called when all strategies have been tested
