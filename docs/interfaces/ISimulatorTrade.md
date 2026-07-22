---
title: docs/interface/ISimulatorTrade
group: docs
---

# ISimulatorTrade

Single simulated trade: an idea evaluated against a grid point.

## Properties

### ideaId

```ts
ideaId: number
```

Identifier of the idea that triggered the trade.

### direction

```ts
direction: SimulatorIdeaDirection
```

Position direction inherited from the idea.

### entryTimestamp

```ts
entryTimestamp: number
```

Unix timestamp in milliseconds of the trade entry minute.

### exitTimestamp

```ts
exitTimestamp: number
```

Unix timestamp in milliseconds of the exit candle.

### exitReason

```ts
exitReason: SimulatorExitReason
```

Why the trade was closed.

### holdMinutesActual

```ts
holdMinutesActual: number
```

Actual holding time, minutes (entry candle inclusive).

### pnlPercent

```ts
pnlPercent: number
```

Trade PnL percent, net of fees on both legs.

### absorbedIdeaIds

```ts
absorbedIdeaIds: number[]
```

Ideas that qualified for entry but were ABSORBED by this trade
holding the slot. A long hold that eats foreign recommendations
is visible here idea by idea.
