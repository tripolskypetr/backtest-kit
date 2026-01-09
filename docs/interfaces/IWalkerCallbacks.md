---
title: docs/interface/IWalkerCallbacks
group: docs
---

# IWalkerCallbacks

Optional lifecycle callbacks for walker events.
Called during strategy comparison process.

## Properties

### onStrategyStart

```ts
onStrategyStart: (strategyName: string, symbol: string) => void | Promise<void>
```

Called when starting to test a specific strategy

### onStrategyComplete

```ts
onStrategyComplete: (strategyName: string, symbol: string, stats: BacktestStatisticsModel, metric: number) => void | Promise<void>
```

Called when a strategy backtest completes

### onStrategyError

```ts
onStrategyError: (strategyName: string, symbol: string, error: unknown) => void | Promise<void>
```

Called when a strategy backtest fails with an error

### onComplete

```ts
onComplete: (results: IWalkerResults) => void | Promise<void>
```

Called when all strategies have been tested
