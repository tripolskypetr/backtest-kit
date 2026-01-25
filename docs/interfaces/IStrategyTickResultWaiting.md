---
title: docs/interface/IStrategyTickResultWaiting
group: docs
---

# IStrategyTickResultWaiting

Tick result: scheduled signal is waiting for price to reach entry point.
This is returned on subsequent ticks while monitoring a scheduled signal.
Different from "scheduled" which is only returned once when signal is first created.

## Properties

### action

```ts
action: "waiting"
```

Discriminator for type-safe union

### signal

```ts
signal: IPublicSignalRow
```

Scheduled signal waiting for activation

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

### percentTp

```ts
percentTp: number
```

Percentage progress towards take profit (always 0 for waiting scheduled signals)

### percentSl

```ts
percentSl: number
```

Percentage progress towards stop loss (always 0 for waiting scheduled signals)

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL for scheduled position (theoretical, not yet activated)

### backtest

```ts
backtest: boolean
```

Whether this event is from backtest mode (true) or live mode (false)

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when this tick result was created (from candle timestamp in backtest or execution context when in live)
