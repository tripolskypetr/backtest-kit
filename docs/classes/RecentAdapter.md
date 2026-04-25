---
title: docs/class/RecentAdapter
group: docs
---

# RecentAdapter

Main recent signal adapter that manages both backtest and live recent signal storage.

Features:
- Subscribes to activePingSubject for automatic storage updates
- Provides unified access to the latest signal for any context
- Singleshot enable pattern prevents duplicate subscriptions
- Cleanup function for proper unsubscription

## Constructor

```ts
constructor();
```

## Properties

### enable

```ts
enable: (() => (...args: any[]) => any) & ISingleshotClearable<() => (...args: any[]) => any>
```

Enables recent signal storage by subscribing to activePingSubject.
Uses singleshot to ensure one-time subscription.

### disable

```ts
disable: () => void
```

Disables recent signal storage by unsubscribing from all emitters.
Safe to call multiple times.

### getLatestSignal

```ts
getLatestSignal: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<IPublicSignalRow>
```

Retrieves the latest active signal for the given symbol and context.
Searches backtest storage first, then live storage.

### getMinutesSinceLatestSignalCreated

```ts
getMinutesSinceLatestSignalCreated: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<number>
```

Returns the number of whole minutes elapsed since the latest signal's creation timestamp.
Searches backtest storage first, then live storage.
