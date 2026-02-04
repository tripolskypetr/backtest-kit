---
title: docs/class/NotificationAdapter
group: docs
---

# NotificationAdapter

Main notification adapter that manages both backtest and live notification storage.

Features:
- Subscribes to signal emitters for automatic notification updates
- Provides unified access to both backtest and live notifications
- Singleshot enable pattern prevents duplicate subscriptions
- Cleanup function for proper unsubscription

## Constructor

```ts
constructor();
```

## Properties

### enable

```ts
enable: (() => () => void) & ISingleshotClearable
```

Enables notification storage by subscribing to signal emitters.
Uses singleshot to ensure one-time subscription.

### disable

```ts
disable: () => void
```

Disables notification storage by unsubscribing from all emitters.
Safe to call multiple times.

### getDataBacktest

```ts
getDataBacktest: () => Promise<NotificationModel[]>
```

Gets all backtest notifications from storage.

### getDataLive

```ts
getDataLive: () => Promise<NotificationModel[]>
```

Gets all live notifications from storage.

### clearBacktest

```ts
clearBacktest: () => Promise<void>
```

Clears all backtest notifications from storage.

### clearLive

```ts
clearLive: () => Promise<void>
```

Clears all live notifications from storage.
