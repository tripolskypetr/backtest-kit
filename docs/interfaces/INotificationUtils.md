---
title: docs/interface/INotificationUtils
group: docs
---

# INotificationUtils

Base interface for notification adapters.
All notification adapters must implement this interface.

## Methods

### handleSignal

```ts
handleSignal: (data: IStrategyTickResult) => Promise<void>
```

Handles signal events (opened, closed, scheduled, cancelled).

### handleSignalNotify

```ts
handleSignalNotify: (data: SignalInfoContract) => Promise<void>
```

### handlePartialProfit

```ts
handlePartialProfit: (data: PartialProfitContract) => Promise<void>
```

Handles partial profit availability event.

### handlePartialLoss

```ts
handlePartialLoss: (data: PartialLossContract) => Promise<void>
```

Handles partial loss availability event.

### handleBreakeven

```ts
handleBreakeven: (data: BreakevenContract) => Promise<void>
```

Handles breakeven availability event.

### handleStrategyCommit

```ts
handleStrategyCommit: (data: StrategyCommitContract) => Promise<void>
```

Handles strategy commit events (partial-profit, breakeven, trailing, etc.).

### handleSync

```ts
handleSync: (data: OrderSyncContract) => Promise<void>
```

Handles signal sync event (signal-open, signal-close).

### handleCheck

```ts
handleCheck: (data: OrderCheckContract) => Promise<void>
```

Handles order-ping check event (signal-ping).

### handleOrderFill

```ts
handleOrderFill: (data: OrderFillContract) => Promise<void>
```

Handles broker-confirmed order fill event (post-verdict, signal-open/signal-close).

### handleOrderReject

```ts
handleOrderReject: (data: OrderRejectContract) => Promise<void>
```

Handles terminal order rejection event (post-verdict, signal-open/signal-close).

### handleOrderContinue

```ts
handleOrderContinue: (data: OrderContinueContract) => Promise<void>
```

Handles post-verdict order-check continue event (order still open, monitoring continues).

### handleOrderStop

```ts
handleOrderStop: (data: OrderStopContract) => Promise<void>
```

Handles post-verdict order-check stop event (terminal: order gone, teardown follows).

### handleRisk

```ts
handleRisk: (data: RiskContract) => Promise<void>
```

Handles risk rejection event.

### handlePause

```ts
handlePause: (data: PauseContract) => Promise<void>
```

Handles strategy pause state change event.

### handleError

```ts
handleError: (error: Error) => Promise<void>
```

Handles error event.

### handleCriticalError

```ts
handleCriticalError: (error: Error) => Promise<void>
```

Handles critical error event.

### handleValidationError

```ts
handleValidationError: (error: Error) => Promise<void>
```

Handles validation error event.

### getData

```ts
getData: () => Promise<NotificationModel[]>
```

Gets all stored notifications.

### dispose

```ts
dispose: () => Promise<void>
```

Clears all stored notifications.
