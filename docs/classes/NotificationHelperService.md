---
title: docs/class/NotificationHelperService
group: docs
---

# NotificationHelperService

Helper service for emitting signal info notifications.

Handles validation (memoized per context) and emission of `signal.info` events
via `signalNotifySubject`. Used internally by the framework action pipeline —
end users interact with this via `commitSignalNotify()` in `onActivePing` callbacks.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### strategySchemaService

```ts
strategySchemaService: any
```

### riskValidationService

```ts
riskValidationService: any
```

### strategyValidationService

```ts
strategyValidationService: any
```

### exchangeValidationService

```ts
exchangeValidationService: any
```

### frameValidationService

```ts
frameValidationService: any
```

### actionValidationService

```ts
actionValidationService: any
```

### strategyCoreService

```ts
strategyCoreService: any
```

### timeMetaService

```ts
timeMetaService: any
```

### validate

```ts
validate: ((context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>) & IClearableMemoize<string> & IControlMemoize<string, Promise<void>>
```

Validates strategy, exchange, frame, risk, and action schemas for the given context.

Memoized per unique `"strategyName:exchangeName[:frameName]"` key — subsequent calls
with the same context are no-ops, so validation runs at most once per context.

### commitSignalNotify

```ts
commitSignalNotify: (payload: Partial<SignalNotificationPayload>, symbol: string, currentPrice: number, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest: boolean) => Promise<...>
```

Emits a `signal.info` notification for the currently active pending signal.

Validates all schemas (via memoized `validate`), resolves the pending signal
for the given symbol, then emits a `SignalInfoContract` via `signalNotifySubject`,
which is routed to all registered `listenSignalNotify` callbacks and persisted
by `NotificationAdapter`.
