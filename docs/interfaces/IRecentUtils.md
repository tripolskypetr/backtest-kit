---
title: docs/interface/IRecentUtils
group: docs
---

# IRecentUtils

Base interface for recent signal storage adapters.

## Methods

### handleActivePing

```ts
handleActivePing: (event: ActivePingContract) => Promise<void>
```

Handles active ping event and persists the latest signal.

### getLatestSignal

```ts
getLatestSignal: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, when: Date) => Promise<IPublicSignalRow>
```

Retrieves the latest active signal for the given context.
Returns null if the stored signal's `timestamp` is greater than the requested `when`
(look-ahead bias protection).

### getMinutesSinceLatestSignalCreated

```ts
getMinutesSinceLatestSignalCreated: (timestamp: number, symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<number>
```

Returns the number of minutes elapsed since the latest signal's timestamp.
`timestamp` doubles as the look-ahead cutoff — a signal whose `timestamp`
exceeds the requested one is treated as not yet visible.
