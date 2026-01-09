---
title: docs/interface/IStrategyTickResultOpened
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
signal: IPublicSignalRow
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

### frameName

```ts
frameName: string
```

Time frame name for tracking (e.g., "1m", "5m")

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

### backtest

```ts
backtest: boolean
```

Whether this event is from backtest mode (true) or live mode (false)
