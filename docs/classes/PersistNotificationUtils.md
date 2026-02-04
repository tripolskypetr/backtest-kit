---
title: docs/class/PersistNotificationUtils
group: docs
---

# PersistNotificationUtils

Utility class for managing notification persistence.

Features:
- Memoized storage instances
- Custom adapter support
- Atomic read/write operations for NotificationData
- Each notification stored as separate file keyed by id
- Crash-safe notification state management

Used by NotificationPersistLiveUtils/NotificationPersistBacktestUtils for persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistNotificationFactory

```ts
PersistNotificationFactory: any
```

### getNotificationStorage

```ts
getNotificationStorage: any
```

### readNotificationData

```ts
readNotificationData: (backtest: boolean) => Promise<NotificationData>
```

Reads persisted notifications data.

Called by NotificationPersistLiveUtils/NotificationPersistBacktestUtils.waitForInit() to restore state.
Uses keys() from PersistBase to iterate over all stored notifications.
Returns empty array if no notifications exist.

### writeNotificationData

```ts
writeNotificationData: (notificationData: NotificationData, backtest: boolean) => Promise<void>
```

Writes notification data to disk with atomic file writes.

Called by NotificationPersistLiveUtils/NotificationPersistBacktestUtils after notification changes to persist state.
Uses notification.id as the storage key for individual file storage.
Uses atomic writes to prevent corruption on crashes.

## Methods

### usePersistNotificationAdapter

```ts
usePersistNotificationAdapter(Ctor: TPersistBaseCtor<string, NotificationModel>): void;
```

Registers a custom persistence adapter.

### useJson

```ts
useJson(): void;
```

Switches to the default JSON persist adapter.
All future persistence writes will use JSON storage.

### useDummy

```ts
useDummy(): void;
```

Switches to a dummy persist adapter that discards all writes.
All future persistence writes will be no-ops.
