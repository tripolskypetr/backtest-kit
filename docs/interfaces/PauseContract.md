---
title: docs/interface/PauseContract
group: docs
---

# PauseContract

Contract for strategy pause state changes emitted by the framework.
Emitted when setPaused toggles the pause flag of a strategy: while paused the
strategy opens nothing new (params.getSignal is not called, a queued createSignal
DTO is held); an existing pending/scheduled signal keeps being monitored and
closes normally.
Consumers can use this event to generate user-facing notifications (e.g. Telegram)
about the pause/resume of automatic trading.
The backtest flag allows consumers to differentiate between live and backtest
updates for appropriate handling.

## Properties

### symbol

```ts
symbol: string
```

Trading symbol (e.g. "BTC/USDT")

### paused

```ts
paused: boolean
```

New pause state: true — generation suspended, false — resumed

### timestamp

```ts
timestamp: number
```

Timestamp of the pause state change (milliseconds since epoch)

### strategyName

```ts
strategyName: string
```

Strategy name for context

### exchangeName

```ts
exchangeName: string
```

Exchange name for context

### frameName

```ts
frameName: string
```

Frame name for context (e.g. "1m", "5m")

### backtest

```ts
backtest: boolean
```

Indicates if the update is from a backtest or live trading (true for backtest, false for live)
