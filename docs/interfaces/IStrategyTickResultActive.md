---
title: docs/interface/IStrategyTickResultActive
group: docs
---

# IStrategyTickResultActive

Tick result: signal is being monitored.
Waiting for TP/SL or time expiration.

## Properties

### action

```ts
action: "active"
```

Discriminator for type-safe union

### signal

```ts
signal: ISignalRow
```

Currently monitored signal

### currentPrice

```ts
currentPrice: number
```

Current VWAP price for monitoring

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

### percentTp

```ts
percentTp: number
```

Percentage progress towards take profit (0-100%, 0 if moving towards SL)

### percentSl

```ts
percentSl: number
```

Percentage progress towards stop loss (0-100%, 0 if moving towards TP)

### backtest

```ts
backtest: boolean
```

Whether this event is from backtest mode (true) or live mode (false)
