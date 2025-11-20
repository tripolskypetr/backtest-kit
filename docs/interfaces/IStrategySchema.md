---
title: docs/api-reference/interface/IStrategySchema
group: docs
---

# IStrategySchema

Strategy schema registered via addStrategy().
Defines signal generation logic and configuration.

## Properties

### strategyName

```ts
strategyName: string
```

### interval

```ts
interval: SignalInterval
```

### getSignal

```ts
getSignal: (symbol: string) => Promise<ISignalDto>
```

### callbacks

```ts
callbacks: Partial<IStrategyCallbacks>
```
