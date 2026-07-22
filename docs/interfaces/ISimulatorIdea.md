---
title: docs/interface/ISimulatorIdea
group: docs
---

# ISimulatorIdea

Single trading idea: a public forecast published by an author.
The unit of simulation — candles are iterated per idea, not per grid point.

## Properties

### id

```ts
id: number
```

Unique idea identifier from the source platform.

### ts

```ts
ts: number
```

Unix timestamp in milliseconds when the idea was published.

### symbol

```ts
symbol: string
```

Trading pair symbol the idea refers to (e.g., "BTCUSDT").

### direction

```ts
direction: SimulatorIdeaDirection
```

Forecast direction claimed by the author.

### author

```ts
author: string
```

Author login on the source platform (unique per author).
