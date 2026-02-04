---
title: docs/class/NotificationBacktestAdapter
group: docs
---

# NotificationBacktestAdapter

Implements `INotificationUtils`

Backtest notification adapter with pluggable notification backend.

Features:
- Adapter pattern for swappable notification implementations
- Default adapter: NotificationMemoryBacktestUtils (in-memory storage)
- Alternative adapters: NotificationPersistBacktestUtils, NotificationDummyBacktestUtils
- Convenience methods: usePersist(), useMemory(), useDummy()

## Constructor

```ts
constructor();
```

## Properties

### _notificationBacktestUtils

```ts
_notificationBacktestUtils: any
```

Internal notification utils instance

### handleSignal

```ts
handleSignal: (data: IStrategyTickResult) => Promise<void>
```

Handles signal events.
Proxies call to the underlying notification adapter.

### handlePartialProfit

```ts
handlePartialProfit: (data: PartialProfitContract) => Promise<void>
```

Handles partial profit availability event.
Proxies call to the underlying notification adapter.

### handlePartialLoss

```ts
handlePartialLoss: (data: PartialLossContract) => Promise<void>
```

Handles partial loss availability event.
Proxies call to the underlying notification adapter.

### handleBreakeven

```ts
handleBreakeven: (data: BreakevenContract) => Promise<void>
```

Handles breakeven availability event.
Proxies call to the underlying notification adapter.

### handleStrategyCommit

```ts
handleStrategyCommit: (data: StrategyCommitContract) => Promise<void>
```

Handles strategy commit events.
Proxies call to the underlying notification adapter.

### handleRisk

```ts
handleRisk: (data: RiskContract) => Promise<void>
```

Handles risk rejection event.
Proxies call to the underlying notification adapter.

### handleError

```ts
handleError: (error: Error) => Promise<void>
```

Handles error event.
Proxies call to the underlying notification adapter.

### handleCriticalError

```ts
handleCriticalError: (error: Error) => Promise<void>
```

Handles critical error event.
Proxies call to the underlying notification adapter.

### handleValidationError

```ts
handleValidationError: (error: Error) => Promise<void>
```

Handles validation error event.
Proxies call to the underlying notification adapter.

### getData

```ts
getData: () => Promise<NotificationModel[]>
```

Gets all stored notifications.
Proxies call to the underlying notification adapter.

### clear

```ts
clear: () => Promise<void>
```

Clears all stored notifications.
Proxies call to the underlying notification adapter.

### useNotificationAdapter

```ts
useNotificationAdapter: (Ctor: TNotificationUtilsCtor) => void
```

Sets the notification adapter constructor.
All future notification operations will use this adapter.

### useDummy

```ts
useDummy: () => void
```

Switches to dummy notification adapter.
All future notification writes will be no-ops.

### useMemory

```ts
useMemory: () => void
```

Switches to in-memory notification adapter (default).
Notifications will be stored in memory only.

### usePersist

```ts
usePersist: () => void
```

Switches to persistent notification adapter.
Notifications will be persisted to disk.
