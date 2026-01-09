---
title: docs/interface/BreakevenEvent
group: docs
---

# BreakevenEvent

Unified breakeven event data for report generation.
Contains all information about when signals reached breakeven.

## Properties

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds

### symbol

```ts
symbol: string
```

Trading pair symbol

### strategyName

```ts
strategyName: string
```

Strategy name

### signalId

```ts
signalId: string
```

Signal ID

### position

```ts
position: string
```

Position type

### currentPrice

```ts
currentPrice: number
```

Current market price when breakeven was reached

### priceOpen

```ts
priceOpen: number
```

Entry price (breakeven level)

### backtest

```ts
backtest: boolean
```

True if backtest mode, false if live mode
