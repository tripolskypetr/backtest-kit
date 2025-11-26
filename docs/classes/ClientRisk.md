---
title: docs/api-reference/class/ClientRisk
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
params: any
```

### _activePositions

```ts
_activePositions: any
```

Map of active positions tracked across all strategies.
Key: `${strategyName}:${exchangeName}:${symbol}`

### checkSignal

```ts
checkSignal: (params: IRiskCheckArgs) => Promise<boolean>
```

Checks if a signal should be allowed based on risk limits.

Executes custom validations with access to:
- Passthrough params from ClientStrategy (symbol, strategyName, exchangeName, currentPrice, timestamp)
- Active positions via this.activePositions getter

Returns false immediately if any validation throws error.
Triggers callbacks (onRejected, onAllowed) based on result.

## Methods

### addSignal

```ts
addSignal(symbol: string, context: {
    strategyName: string;
    riskName: string;
}): Promise<void>;
```

Registers a new opened signal.
Called by StrategyConnectionService after signal is opened.

### removeSignal

```ts
removeSignal(symbol: string, context: {
    strategyName: string;
    riskName: string;
}): Promise<void>;
```

Removes a closed signal.
Called by StrategyConnectionService when signal is closed.
