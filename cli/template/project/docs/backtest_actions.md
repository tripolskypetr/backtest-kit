# Actions (addActionSchema / IPublicAction / pingActive)

## Overview

Actions are lifecycle hooks that run while a position is open. They are registered with `addActionSchema` and attached to a strategy via `actions` array. The most common use is `pingActive` — called on every tick while a pending signal exists.

```ts
import {
  addActionSchema,
  commitClosePending,
  getPendingSignal,
  IPublicAction,
  ActivePingContract,
} from "backtest-kit";
```

---

## `addActionSchema`

```ts
addActionSchema({
  actionName: "my_action",
  handler: class implements IPublicAction {
    async pingActive(event: ActivePingContract) {
      // called every tick while a position is open
    }
  },
});
```

Attach to strategy:

```ts
addStrategySchema({
  strategyName: "my_strategy",
  interval: "15m",
  getSignal: ...,
  actions: ["my_action"],
});
```

---

## `ActivePingContract`

Fields available inside `pingActive`:

| Field | Type | Description |
|---|---|---|
| `symbol` | `string` | Trading pair (e.g. `"BTCUSDT"`) |

---

## `getPendingSignal(symbol)`

Returns the currently active pending signal. Use it to read `position`, `priceOpen`, `priceTakeProfit`, `priceStopLoss`.

```ts
const pendingSignal = await getPendingSignal(event.symbol);
pendingSignal.position        // "long" | "short"
pendingSignal.priceOpen       // entry price
pendingSignal.priceTakeProfit
pendingSignal.priceStopLoss
```

---

## `commitClosePending(symbol)`

Closes the active pending signal immediately (market close).

```ts
await commitClosePending(event.symbol);
```

---

## Pattern: Close on trend reversal

Close an open position when the trend indicator reverses against it.

```ts
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
```

Where `exitSignal` is an output node that returns `boolean`:

```ts
const exitSignal = outputNode(
  async ([trend, pendingSignal]) => {
    if (!pendingSignal) return false;
    if (pendingSignal.position === "long"  && trend.position === -1) return true;
    if (pendingSignal.position === "short" && trend.position ===  1) return true;
    return false;
  },
  masterTrendSource,
  pendingSignalSource,
);
```

See `backtest_graph_multiple_outputs.md` for the full pattern with `enterSignal` / `exitSignal`.

---

## Other `IPublicAction` lifecycle methods

Beyond `pingActive`, actions can implement:

| Method | When called |
|---|---|
| `pingActive(event)` | Every tick while position is open |
| `onOpen(event)` | Position just opened |
| `onClose(event)` | Position closed (TP/SL/manual) |
| `onIdle(event)` | Every tick when no position is open |

All methods are optional — implement only what you need.

---

## Pattern: DCA (dollar-cost averaging)

From `feb_2024.strategy.ts`:

```ts
addActionSchema({
  actionName: "long_dollar_cost_averaging",
  handler: class implements IPublicAction {
    async pingActive(event: ActivePingContract) {
      const pendingSignal = await getPendingSignal(event.symbol);
      if (pendingSignal.position !== "long") return;
      if (pendingSignal.totalEntries > 5) return;
      const currentPrice = await getAveragePrice(event.symbol);
      if (currentPrice > pendingSignal.originalPriceOpen) return;
      if (await getPositionEntryOverlap(event.symbol, currentPrice, {
        lowerPercent: 0.5, upperPercent: 0.5,
      })) return;
      await commitAverageBuy(event.symbol);
    }
  },
});
```

Key guards before DCA:
1. `position !== "long"` — skip if wrong direction
2. `totalEntries > 5` — cap at 5 entries
3. `currentPrice > originalPriceOpen` — only average down, not up
4. `getPositionEntryOverlap` — avoid averaging too close to an existing entry
