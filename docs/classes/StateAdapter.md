---
title: docs/class/StateAdapter
group: docs
---

# StateAdapter

Main state adapter that manages both backtest and live state storage.

Features:
- Subscribes to signal lifecycle events (cancelled/closed) to dispose stale instances
- Routes all operations to StateBacktest or StateLive based on dto.backtest
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

Enables state storage by subscribing to signal lifecycle events.
Clears memoized instances in StateBacktest and StateLive when a signal
is cancelled or closed, preventing stale instances from accumulating.
Uses singleshot to ensure one-time subscription.

### disable

```ts
disable: () => void
```

Disables state storage by unsubscribing from signal lifecycle events.
Safe to call multiple times.

### getState

```ts
getState: <Value extends object = object>(dto: { signalId: string; bucketName: string; initialValue: object; backtest: boolean; }) => Promise<Value>
```

Read the current state value for a signal.
Routes to StateBacktest or StateLive based on dto.backtest.

### setState

```ts
setState: <Value extends object = object>(dispatch: Value | Dispatch<Value>, dto: { signalId: string; bucketName: string; initialValue: object; backtest: boolean; }) => Promise<Value>
```

Update the state value for a signal.
Routes to StateBacktest or StateLive based on dto.backtest.
