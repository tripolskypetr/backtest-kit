# Graph Pattern (sourceNode / outputNode / resolve)

## Purpose

`@backtest-kit/graph` provides a typed directed acyclic graph (DAG) for composing strategy logic. Instead of a single monolithic `getSignal` function, you define reusable **source nodes** (data fetchers) and **output nodes** (computations that combine them).

Benefits:
- Each node caches independently via `Cache.fn`
- Type-safe: TypeScript infers value types through the graph
- Parallel resolution: sibling nodes resolve concurrently

---

## Core API

```ts
import { sourceNode, outputNode, resolve } from "@backtest-kit/graph";
import { Cache } from "backtest-kit";
```

### `sourceNode(fetch)`

A leaf node with no dependencies. Fetches data from an external source.

```ts
const mySource = sourceNode(
  Cache.fn(
    async (symbol: string) => {
      const candles = await getCandles(symbol, "15m", 500);
      return garch.predictRange(candles, "15m", 32);
    },
    { interval: "15m", key: ([symbol]) => symbol },
  ),
);
```

- `fetch` signature: `(symbol: string, when: Date, exchangeName: string) => Promise<T>`
- `Cache.fn` wraps the fetch function with interval-based caching (see [Cache section](#cachefn))
- `T` can be any non-undefined value: `number`, `string`, `boolean`, `object`, `null`

### `outputNode(compute, ...nodes)`

A computation node that receives resolved values from its dependencies.

```ts
const strategySignal = outputNode(
  async ([trend, volume, reversal]) => {
    // trend, volume, reversal are the resolved values of the three source nodes
    if (!volume.reliable) return null;
    return { position: "long", priceTakeProfit: volume.upperPrice, ... };
  },
  masterTrendSource,  // dependency 1 → trend
  rangeSource,        // dependency 2 → volume
  reversalSource,     // dependency 3 → reversal
);
```

- `compute` receives a tuple of resolved values **in the same order as the nodes**
- Return type is inferred automatically
- Can return `null` (no signal)
- Can be nested: an output node can be a dependency of another output node

### `resolve(node)`

Executes the graph: resolves all dependencies recursively, then calls `compute`.

```ts
addStrategySchema({
  strategyName: "my_strategy",
  interval: "15m",
  getSignal: () => resolve(strategySignal),
});
```

- Dependencies are resolved **in parallel** (Promise.all internally)
- The `symbol` and `when` context is injected automatically from the strategy runtime
- Returns the output node's computed value

---

## Cache.fn

Wraps any async function to cache results per candle interval and per cache key.

```ts
const cachedFn = Cache.fn(
  async (symbol: string) => {
    // expensive operation
    return fetchSomething(symbol);
  },
  {
    interval: "15m",                    // invalidate every 15m candle boundary
    key: ([symbol]) => symbol,          // separate cache entry per symbol
  },
);
```

**How invalidation works:** The cache aligns to candle boundaries. At `interval="15m"`, the cache is valid within the same 15-minute bar and invalidated when a new bar opens. This means multiple calls within one bar return the same result without re-fetching.

**Without `key`:** single cache entry — all calls share one result regardless of arguments.
**With `key`:** separate cache entry per key — `"BTCUSDT"` and `"ETHUSDT"` computed independently.

Cache.fn is designed to be passed directly as the `fetch` argument to `sourceNode`.

---

## Full Pattern Example

```ts
import { extract, run, File } from "@backtest-kit/pinets";
import { getCandles, getAggregatedTrades, Cache } from "backtest-kit";
import { sourceNode, outputNode, resolve } from "@backtest-kit/graph";
import * as garch from "garch";
import * as anomaly from "volume-anomaly";

// === Source nodes ===

const masterTrendSource = sourceNode(
  Cache.fn(
    async (symbol) => {
      const plots = await run(
        File.fromPath("master_trend_15m.pine", "../math"),
        { symbol, timeframe: "15m", limit: 180 },
      );
      return extract(plots, {
        position: "Position",
        close:    "Close",
      });
    },
    { interval: "15m", key: ([symbol]) => symbol },
  ),
);

const rangeSource = sourceNode(
  Cache.fn(
    async (symbol) => {
      const candles = await getCandles(symbol, "15m", 1_000);
      return garch.predictRange(candles, "15m", 32);
    },
    { interval: "15m", key: ([symbol]) => symbol },
  ),
);

const reversalSource = sourceNode(
  Cache.fn(
    async (symbol) => {
      const all = await getAggregatedTrades(symbol, 1400);
      return anomaly.predict(all.slice(0, 1200), all.slice(1200), 0.75);
    },
    { interval: "15m", key: ([symbol]) => symbol },
  ),
);

// === Output node (signal logic) ===

const strategySignal = outputNode(
  async ([trend, volume, reversal]) => {
    if (!volume.reliable || volume.movePercent < 0.7) return null;
    if (trend.position === 0) return null;
    if (!reversal.anomaly) return null;

    let position: "long" | "short" | null = null;
    if (trend.position === 1  && reversal.direction === "long")  position = "long";
    if (trend.position === -1 && reversal.direction === "short") position = "short";
    if (!position) return null;

    return {
      id: randomString(),
      position,
      priceTakeProfit:     position === "long" ? volume.upperPrice : volume.lowerPrice,
      priceStopLoss:       position === "long" ? volume.lowerPrice : volume.upperPrice,
      minuteEstimatedTime: 480,
    } as const;
  },
  masterTrendSource,
  rangeSource,
  reversalSource,
);

// === Wire into strategy ===

addStrategySchema({
  strategyName: "bounce_strategy",
  interval: "15m",
  getSignal: () => resolve(strategySignal),
});
```

---

## Cache Interval Selection

Choose `Cache.fn` interval to match the data's natural update frequency:

| Data source | Recommended interval |
|---|---|
| Pine indicator (15m timeframe) | `"15m"` |
| `garch.predictRange` on 15m candles | `"15m"` |
| `garch.predict` on 5m candles | `"5m"` |
| `anomaly.predict` (trade stream) | `"5m"` — refreshed every 5m bar |
| Funding rate | `"1h"` |
| Order book snapshot | `"1m"` |

Setting interval too short wastes compute; too long means stale data spanning multiple bars. Match to the smallest timeframe of the data being fetched.

---

## Type Safety

The graph is fully typed. TypeScript infers the compute callback parameter types from the node declarations:

```ts
// If rangeSource returns garch.PredictionResult:
const rangeSource = sourceNode(
  Cache.fn(async (symbol) => garch.predictRange(candles, "15m", 32), { interval: "15m", key: ([s]) => s }),
);
// TS knows rangeSource is SourceNode<PredictionResult>

const out = outputNode(
  async ([volume]) => {
    volume.movePercent  // ✓ typed as number
    volume.upperPrice   // ✓ typed as number
    volume.nonExistent  // ✗ TS error
  },
  rangeSource,
);
```

---

## Notes

- `resolve()` is called **inside** `getSignal`, not at module level. This ensures the graph runs per-tick with the correct symbol/when context.
- Each source node in the graph is resolved **once per tick** even if referenced by multiple output nodes (deduplication by reference).
- The graph does **not** support cycles.
