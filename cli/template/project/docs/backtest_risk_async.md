# Async Risk Validation with resolve()

## Overview

Risk validators can be async and call `resolve()` on any graph node. This lets you reuse the same source nodes (garch, trend, fear & greed) in both signal generation and risk filtering — without duplicate fetches.

---

## Sync vs async validation

`backtest_strategy_structure.md` shows the basic sync pattern:

```ts
// Sync — receives pre-computed payload fields
validations: [
  {
    validate: ({ currentSignal, currentPrice }) => {
      if (currentSignal.position === "short" && currentPrice > 50000) {
        throw new Error("Price too high for short");
      }
    },
  },
],
```

Async pattern — resolve a graph node:

```ts
// Async — fetch fresh data at validation time
validations: [
  async () => {
    const garch = await resolve(garchSource);
    if (!garch.reliable || garch.movePercent < 1.0) {
      throw new Error(`GARCH volatility too low: ${garch.movePercent.toFixed(2)}%`);
    }
  },
],
```

Both forms can coexist in the same `validations` array.

---

## GARCH volatility gate

The canonical use case: block signals when predicted volatility is too low to cover transaction costs and generate profit.

```ts
import { predict } from "garch";
import { sourceNode, resolve } from "@backtest-kit/graph";
import { Cache, getCandles, addRiskSchema } from "backtest-kit";

const CANDLES_FOR_GARCH = 1_000;
const GARCH_CONFIDENCE  = 0.95;
const MIN_MOVE_PERCENT  = 1.0;

const garchSource = sourceNode(
  Cache.fn(
    async (symbol: string) => {
      const candles = await getCandles(symbol, "8h", CANDLES_FOR_GARCH);
      return predict(candles, "8h", null, GARCH_CONFIDENCE);
    },
    { interval: "8h", key: ([symbol]: [string]) => symbol },
  ),
);

addRiskSchema({
  riskName: "garch_volatility_risk",
  validations: [
    async () => {
      const garch = await resolve(garchSource);
      if (!garch.reliable || garch.movePercent < MIN_MOVE_PERCENT) {
        throw new Error(
          `GARCH volatility too low: ${garch.movePercent.toFixed(2)}% (need ≥${MIN_MOVE_PERCENT}%, confidence=${GARCH_CONFIDENCE})`,
        );
      }
    },
  ],
});
```

**`garch.reliable`** — false when the model didn't converge or has insufficient data. Always check this before using `movePercent`.

**`garch.movePercent`** — predicted price move as percentage of current price over one candle (one 8h bar here). At confidence=0.95 (±1.96σ), a value of 1.0 means the model predicts ≥1% move with 95% probability.

---

## Fear & Greed gate (directional)

From `feb_2024.strategy.ts` — block longs in fear and shorts in greed:

```ts
addRiskSchema({
  riskName: "fear_greed_directional",
  validations: [
    async ({ currentSignal }) => {
      const fearGreed = await resolve(fearGreedSource);
      if (currentSignal.position === "short" && fearGreed > 50) {
        throw new Error(`Still greed (${fearGreed}): short not allowed`);
      }
    },
    async ({ currentSignal }) => {
      const fearGreed = await resolve(fearGreedSource);
      if (currentSignal.position === "long" && fearGreed < 50) {
        throw new Error(`Still fear (${fearGreed}): long not allowed`);
      }
    },
  ],
});
```

`fearGreedSource` uses `Cache.file` with `interval: "8h"` — fetched once per 8h from `api.alternative.me`.

---

## Node deduplication in risk

When `garchSource` is a dependency of both `enterSignal` (output node) and the risk validator, the graph deduplicates resolution within the same tick. If `getSignal()` already resolved `garchSource`, the risk validator gets the cached result — no second fetch.

This only holds if the validator uses `resolve(garchSource)` with the **same node reference**. Do not create a new `sourceNode` inside the validator — that would be a different node with its own cache.

---

## `validate` vs bare async function

Both forms are accepted in `validations`:

```ts
// Object form — supports `note` field
validations: [
  {
    note: "GARCH volatility must be at least 1%",
    validate: async () => {
      const garch = await resolve(garchSource);
      if (!garch.reliable || garch.movePercent < 1.0) {
        throw new Error("...");
      }
    },
  },
]

// Bare async function — more concise
validations: [
  async () => {
    const garch = await resolve(garchSource);
    if (!garch.reliable || garch.movePercent < 1.0) {
      throw new Error("...");
    }
  },
]
```

Throw `Error` to reject the signal. Return normally (or return `void`) to allow it.
