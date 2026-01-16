---
title: docs/interface/IStrategySchema
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

Unique strategy identifier for registration

### note

```ts
note: string
```

Optional developer note for documentation

### interval

```ts
interval: SignalInterval
```

Minimum interval between getSignal calls (throttling)

### getSignal

```ts
getSignal: (symbol: string, when: Date) => Promise<ISignalDto>
```

Signal generation function (returns null if no signal, validated DTO if signal).
If priceOpen is provided - becomes scheduled signal waiting for price to reach entry point.
If priceOpen is omitted - opens immediately at current price.

### callbacks

```ts
callbacks: Partial<IStrategyCallbacks>
```

Optional lifecycle event callbacks (onOpen, onClose)

### riskName

```ts
riskName: string
```

Optional risk profile identifier for risk management

### riskList

```ts
riskList: string[]
```

Optional several risk profile list for risk management (if multiple required)

### actions

```ts
actions: string[]
```

Optional list of action identifiers to attach to this strategy
