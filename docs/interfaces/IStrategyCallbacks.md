---
title: docs/api-reference/interface/IStrategyCallbacks
group: docs
---

# IStrategyCallbacks

Optional lifecycle callbacks for signal events.
Called when signals are opened, active, idle, closed, scheduled, or cancelled.

## Properties

### onTick

```ts
onTick: (symbol: string, result: IStrategyTickResult, backtest: boolean) => void
```

Called on every tick with the result

### onOpen

```ts
onOpen: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void
```

Called when new signal is opened (after validation)

### onActive

```ts
onActive: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void
```

Called when signal is being monitored (active state)

### onIdle

```ts
onIdle: (symbol: string, currentPrice: number, backtest: boolean) => void
```

Called when no active signal exists (idle state)

### onClose

```ts
onClose: (symbol: string, data: ISignalRow, priceClose: number, backtest: boolean) => void
```

Called when signal is closed with final price

### onSchedule

```ts
onSchedule: (symbol: string, data: IScheduledSignalRow, currentPrice: number, backtest: boolean) => void
```

Called when scheduled signal is created (delayed entry)

### onCancel

```ts
onCancel: (symbol: string, data: IScheduledSignalRow, currentPrice: number, backtest: boolean) => void
```

Called when scheduled signal is cancelled without opening position
