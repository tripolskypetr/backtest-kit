---
title: docs/interface/IStrategyCallbacks
group: docs
---

# IStrategyCallbacks

Optional lifecycle callbacks for signal events.
Called when signals are opened, active, idle, closed, scheduled, or cancelled.

## Properties

### onTick

```ts
onTick: (symbol: string, result: IStrategyTickResult, backtest: boolean) => void | Promise<void>
```

Called on every tick with the result

### onOpen

```ts
onOpen: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean) => void | Promise<void>
```

Called when new signal is opened (after validation)

### onActive

```ts
onActive: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean) => void | Promise<void>
```

Called when signal is being monitored (active state)

### onIdle

```ts
onIdle: (symbol: string, currentPrice: number, backtest: boolean) => void | Promise<void>
```

Called when no active signal exists (idle state)

### onClose

```ts
onClose: (symbol: string, data: IPublicSignalRow, priceClose: number, backtest: boolean) => void | Promise<void>
```

Called when signal is closed with final price

### onSchedule

```ts
onSchedule: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean) => void | Promise<void>
```

Called when scheduled signal is created (delayed entry)

### onCancel

```ts
onCancel: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean) => void | Promise<void>
```

Called when scheduled signal is cancelled without opening position

### onWrite

```ts
onWrite: (symbol: string, data: IPublicSignalRow, backtest: boolean) => void
```

Called when signal is written to persist storage (for testing)

### onPartialProfit

```ts
onPartialProfit: (symbol: string, data: IPublicSignalRow, currentPrice: number, revenuePercent: number, backtest: boolean) => void | Promise<void>
```

Called when signal is in partial profit state (price moved favorably but not reached TP yet)

### onPartialLoss

```ts
onPartialLoss: (symbol: string, data: IPublicSignalRow, currentPrice: number, lossPercent: number, backtest: boolean) => void | Promise<void>
```

Called when signal is in partial loss state (price moved against position but not hit SL yet)

### onPing

```ts
onPing: (symbol: string, data: IPublicSignalRow, when: Date, backtest: boolean) => void | Promise<void>
```

Called every minute regardless of strategy interval (for custom monitoring like checking if signal should be cancelled)
