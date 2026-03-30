# Graph Pattern: Multiple Output Nodes (enterSignal / exitSignal)

## Why Two Output Nodes

A strategy can have separate output nodes for entry and exit logic. This keeps concerns separated and allows `exitSignal` to be reused in both an action (`pingActive`) and risk validators independently.

```
masterTrendSource ──┬──► enterSignal  →  getSignal()
                    └──► exitSignal   →  pingActive() in action
fundamentalSource ──►  enterSignal
pendingSignalSource ──► exitSignal
garchSource ────────►  risk validator (resolve directly)
```

---

## Full Pattern

```ts
import { sourceNode, outputNode, resolve } from "@backtest-kit/graph";
import { getPendingSignal, commitClosePending } from "backtest-kit";

// --- Source nodes ---

const masterTrendSource = sourceNode(
  Cache.fn(
    async (symbol: string) => {
      const plots = await run(
        File.fromPath("master_trend_15m.pine", "../../math"),
        { symbol, timeframe: "15m", limit: 180 },
      );
      return extract(plots, {
        position: "Position",  // -1 | 0 | 1
        close: "Close",
      });
    },
    { interval: "15m", key: ([symbol]: [string]) => symbol },
  ),
);

// Raw source node — no cache, reads live state every tick
const pendingSignalSource = sourceNode(
  async (symbol) => await getPendingSignal(symbol),
);

// --- Output node: entry ---

const enterSignal = outputNode(
  async ([trend, fundamental]) => {
    if (fundamental.position === "wait") return null;
    if (trend.position === 0) return null;
    const fundamentalDir = fundamental.position === "long" ? 1 : -1;
    if (fundamentalDir !== trend.position) return null;

    const position = fundamentalDir === 1 ? "long" : "short";
    const price = trend.close;
    return {
      id: randomString(),
      position,
      priceTakeProfit: position === "long" ? price * 1.05 : price * 0.95,
      priceStopLoss:   position === "long" ? price * 0.95 : price * 1.05,
      minuteEstimatedTime: 480,
    } as const;
  },
  masterTrendSource,
  fundamentalSource,
);

// --- Output node: exit ---

const exitSignal = outputNode(
  async ([trend, pendingSignal]) => {
    if (!pendingSignal) return false;
    if (pendingSignal.position === "long"  && trend.position === -1) return true;
    if (pendingSignal.position === "short" && trend.position ===  1) return true;
    return false;
  },
  masterTrendSource,    // shared with enterSignal — resolved once per tick
  pendingSignalSource,
);

// --- Action uses exitSignal ---

addActionSchema({
  actionName: "trend_reversal_close",
  handler: class implements IPublicAction {
    async pingActive(event: ActivePingContract) {
      const shouldClose = await resolve(exitSignal);
      if (shouldClose) {
        await commitClosePending(event.symbol);
      }
    }
  },
});

// --- Strategy wires enterSignal ---

addStrategySchema({
  strategyName: "feb_2026_strategy",
  interval: "15m",
  getSignal: () => resolve(enterSignal),
  actions: ["trend_reversal_close"],
});
```

---

## Shared Node Deduplication

`masterTrendSource` is a dependency of both `enterSignal` and `exitSignal`. When both are resolved in the same tick, `@backtest-kit/graph` deduplicates by reference — the Pine script runs **once**, not twice.

This is the main reason to split logic into multiple output nodes rather than one large node: each source is computed once regardless of how many output nodes depend on it.

---

## Raw sourceNode (no Cache.fn)

`pendingSignalSource` has no `Cache.fn` wrapper:

```ts
const pendingSignalSource = sourceNode(
  async (symbol) => await getPendingSignal(symbol),
);
```

Use this pattern when:
- The data changes every tick and must not be cached (live position state)
- The source is cheap to fetch (single in-memory lookup)
- Caching would return stale data within the same candle

Contrast with `masterTrendSource` which uses `Cache.fn` with `interval: "15m"` — Pine runs once per 15m bar and the result is reused for all ticks within that bar.

---

## `exitSignal` return type

`exitSignal` returns `boolean`, not `ISignalDto | null`. Output nodes are not limited to signal shapes — they can return any value that the consumer needs. The action reads `boolean`, the risk validator could read a number, etc.
