---
title: docs/class/ClientRisk
group: docs
---

# ClientRisk

Implements `IRisk`

ClientRisk implementation for portfolio-level risk management.

Provides risk checking logic to prevent signals that violate configured limits:
- Maximum concurrent positions (tracks across all strategies)
- Custom validations with access to all active positions

Multiple ClientStrategy instances share the same ClientRisk instance,
allowing cross-strategy risk analysis.

Used internally by strategy execution to validate signals before opening positions.

## Constructor

```ts
constructor(params: IRiskParams);
```

## Properties

### params

```ts
params: IRiskParams
```

### _activePositions

```ts
_activePositions: RiskMap | unique symbol
```

Map of active positions tracked across all strategies.
Key: `${strategyName}:${exchangeName}:${symbol}`
Starts as POSITION_NEED_FETCH symbol, gets initialized on first use.

### waitForInit

```ts
waitForInit: any
```

Initializes active positions by loading from persistence.
Uses singleshot pattern to ensure initialization happens exactly once.
Skips persistence in backtest mode.

### _updatePositions

```ts
_updatePositions: any
```

Persists current active positions to disk.
Skips in backtest mode.

### checkSignal

```ts
checkSignal: (params: IRiskCheckArgs, options?: Partial<IRiskCheckOptions>) => Promise<boolean>
```

Checks if a signal should be allowed based on risk limits.

Executes custom validations with access to:
- Passthrough params from ClientStrategy (symbol, strategyName, exchangeName, currentPrice, timestamp)
- Active positions via this.activePositions getter

Returns false immediately if any validation throws error.
Triggers callbacks (onRejected, onAllowed) based on result.

### checkSignalAndReserve

```ts
checkSignalAndReserve: (params: IRiskCheckArgs) => Promise<boolean>
```

Concurrency-safe variant of {@link checkSignal}: validates the signal AND
reserves a placeholder slot in the active position map atomically.

**Why this exists.** `checkSignal` followed later by `addSignal` is not
atomic — between the two calls the caller does signal setup work that
yields to the event loop (sync-open callback, persist writes, etc.). When
several strategies sharing the same risk profile run in parallel, all of
them can pass `checkSignal` while the active position map is still empty,
then each call `addSignal` and blow past the limit. Reserving inside the
lock guarantees the next concurrent caller observes the incremented size
before its own validation runs.

The reservation uses the same map key as the eventual `addSignal` call
(`strategyName + exchangeName + symbol`), so `addSignal` overwrites the
placeholder rather than appending a duplicate.

Callers MUST ensure that every successful return is followed by either
`addSignal` (overwrites the placeholder with real data) or `removeSignal`
(clears the placeholder if opening is aborted). Otherwise the riskMap
accumulates stale reservations.

## Methods

### addSignal

```ts
addSignal(symbol: string, context: {
    strategyName: StrategyName;
    riskName: RiskName;
    exchangeName: ExchangeName;
    frameName: FrameName;
}, positionData: {
    position: "long" | "short";
    priceOpen: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    minuteEstimatedTime: number;
    openTimestamp: number;
}): Promise<void>;
```

Registers a new opened signal.
Called by StrategyConnectionService after signal is opened.

### removeSignal

```ts
removeSignal(symbol: string, context: {
    strategyName: StrategyName;
    riskName: RiskName;
    exchangeName: ExchangeName;
    frameName: string;
}): Promise<void>;
```

Removes a closed signal.
Called by StrategyConnectionService when signal is closed.
