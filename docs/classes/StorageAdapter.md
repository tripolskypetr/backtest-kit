---
title: docs/class/StorageAdapter
group: docs
---

# StorageAdapter

Main storage adapter that manages both backtest and live signal storage.

Features:
- Subscribes to signal emitters for automatic storage updates
- Provides unified access to both backtest and live signals
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

Enables signal storage by subscribing to signal emitters.
Uses singleshot to ensure one-time subscription.

### disable

```ts
disable: () => void
```

Disables signal storage by unsubscribing from all emitters.
Safe to call multiple times.

### findSignalById

```ts
findSignalById: (id: string) => Promise<IStorageSignalRow>
```

Finds a signal by ID across both backtest and live storage.

### listSignalBacktest

```ts
listSignalBacktest: () => Promise<IStorageSignalRow[]>
```

Lists all backtest signals from storage.

### listSignalLive

```ts
listSignalLive: () => Promise<IStorageSignalRow[]>
```

Lists all live signals from storage.
