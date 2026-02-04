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

### handleRisk

```ts
handleRisk: (data: RiskContract) => Promise<void>
```

Handles risk rejection event.

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

### clear

```ts
clear: () => Promise<void>
```

Clears all stored notifications.
