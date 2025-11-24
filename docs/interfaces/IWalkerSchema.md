---
title: docs/api-reference/interface/IWalkerSchema
group: docs
---

# IWalkerSchema

Walker schema registered via addWalker().
Defines A/B testing configuration for multiple strategies.

## Properties

### walkerName

```ts
walkerName: string
```

Unique walker identifier for registration

### note

```ts
note: string
```

Optional developer note for documentation

### exchangeName

```ts
exchangeName: string
```

Exchange to use for backtesting all strategies

### frameName

```ts
frameName: string
```

Timeframe generator to use for backtesting all strategies

### strategies

```ts
strategies: string[]
```

List of strategy names to compare (must be registered via addStrategy)

### metric

```ts
metric: WalkerMetric
```

Metric to optimize (default: "sharpeRatio")

### callbacks

```ts
callbacks: Partial<IWalkerCallbacks>
```

Optional lifecycle event callbacks
