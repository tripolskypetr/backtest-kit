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
getLatestSignal: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<IPublicSignalRow>
```

Retrieves the latest active signal for the given context.

### getMinutesSinceLatestSignalCreated

```ts
getMinutesSinceLatestSignalCreated: (timestamp: number, symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<number>
```

Returns the number of minutes elapsed since the latest signal's timestamp.
