---
title: docs/api-reference/interface/IStrategyTickResultOpened
group: docs
---

# IStrategyTickResultOpened

Tick result: new signal just created.
Triggered after getSignal validation and persistence.

## Properties

### action

```ts
action: "opened"
```

Discriminator for type-safe union

### signal

```ts
signal: ISignalRow
```

Newly created and validated signal with generated ID

### strategyName

```ts
strategyName: string
```

Strategy name for tracking

### exchangeName

```ts
exchangeName: string
```

Exchange name for tracking

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### currentPrice

```ts
currentPrice: number
```

Current VWAP price at signal open
