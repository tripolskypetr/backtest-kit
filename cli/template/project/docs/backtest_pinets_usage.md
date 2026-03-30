# Pine Script Integration (@backtest-kit/pinets)

## Overview

`@backtest-kit/pinets` runs `.pine` files against exchange data and returns named plot series. In a strategy file you use two functions: `run()` to execute the script and `extract()` to read the last bar's values.

---

## Key Difference: Strategy vs Standalone Runner

| Context | `exchangeName` | `when` |
|---|---|---|
| `content/*.strategy.ts` (backtest CLI) | **omit** — resolved from context | **omit** — uses current backtest tick |
| `scripts/run_*.mjs` (standalone) | **required** | **required** |

In strategy files, both arguments are injected automatically by the runtime. Do not pass them manually.

---

## `run(source, params)` — Execute Pine Script

```ts
import { run, File } from "@backtest-kit/pinets";

const plots = await run(
  File.fromPath("master_trend_15m.pine", "../math"),
  {
    symbol:    "BTCUSDT",   // injected from strategy context automatically
    timeframe: "15m",       // Pine script timeframe
    limit:     180,         // number of candles (warmup + output)
  },
  // exchangeName omitted — resolved from context in strategy files
  // when omitted — uses current backtest tick time
);
```

**`File.fromPath(filename, baseDir)`:**
- `filename` — path relative to `baseDir`, not cwd
- `baseDir` — optional, defaults to cwd
- Example: `File.fromPath("master_trend_15m.pine", "../math")` → resolves to `../math/master_trend_15m.pine`

**`params.limit`:**
- Must cover warmup + desired output bars
- See `pine_indicator_warmup.md` for how to calculate the correct limit

**Returns:** `PlotModel` — a record of plot name → `{ data: Array<{ time: number, value: number }> }`

---

## `extract(plots, mapping)` — Read Last Bar Values

`extract` reads the **last valid bar** from each named plot and returns a typed record.

```ts
import { extract } from "@backtest-kit/pinets";

const result = await extract(plots, {
  position: "Position",  // JS key → Pine plot name (case-sensitive)
  close:    "Close",
});

// result.position → number (last bar value of "Position" plot)
// result.close    → number
```

**The mapping object:**
- Keys: JavaScript field names you want to use
- Values: exact Pine plot names as written in the `plot(value, "Name", ...)` call
- Plot names are **case-sensitive**

**Advanced mapping — read N bars back:**

```ts
const result = await extract(plots, {
  position:     "Position",
  prevPosition: { plot: "Position", barsBack: 1 },   // previous bar value
});
// result.prevPosition → value from 1 bar before last
```

**With transform:**

```ts
const result = await extract(plots, {
  isLong: { plot: "Position", transform: (v) => v === 1 },  // returns boolean
});
```

---

## Pine Plot Convention

For `extract()` to work, the Pine script must expose plots with `display=display.data_window`:

```pine
// === OUTPUTS FOR BOT ===
plot(close,    "Close",    display=display.data_window)
plot(position, "Position", display=display.data_window)
```

Plots without `display=display.data_window` are not accessible via `extract()`.

---

## Using in a sourceNode

The standard pattern in a strategy — wrap in `Cache.fn` inside `sourceNode`:

```ts
import { run, extract, File } from "@backtest-kit/pinets";
import { Cache } from "backtest-kit";
import { sourceNode } from "@backtest-kit/graph";

const masterTrendSource = sourceNode(
  Cache.fn(
    async (symbol) => {
      const plots = await run(
        File.fromPath("master_trend_15m.pine", "../math"),
        {
          symbol,
          timeframe: "15m",
          limit: 180,           // warmup(30) + 150 output bars
        },
      );
      return extract(plots, {
        position: "Position",
        close:    "Close",
      });
    },
    { interval: "15m", key: ([symbol]) => symbol },
  ),
);
```

- Cache interval matches the Pine timeframe (`"15m"`)
- `key` separates cache by symbol (important for multi-symbol backtests)
- `limit` must be set high enough — see `pine_indicator_warmup.md`

---

## `getSignal()` — Pine-Driven Signal

An alternative to manually computing signals in JS: let Pine compute the signal directly.

Pine script must expose specific plot names:

```pine
plot(signal,         "Signal",        display=display.data_window)  // 1=long, -1=short, 0=none
plot(close,          "Close",         display=display.data_window)  // entry price
plot(sl_price,       "StopLoss",      display=display.data_window)
plot(tp_price,       "TakeProfit",    display=display.data_window)
plot(estimated_time, "EstimatedTime", display=display.data_window)  // optional, default 240
```

```ts
import { getSignal, File } from "@backtest-kit/pinets";

const signal = await getSignal(
  File.fromPath("my_signal.pine", "../math"),
  { symbol, timeframe: "15m", limit: 200 },
);
// Returns ISignalDto | null
```

Use `getSignal` when signal logic is simpler to express in Pine than in JS. Use `run` + `extract` when you need to combine Pine output with JS-side libraries (garch, volume-anomaly, etc.).

---

## Limit Calculation Quick Reference

See `pine_indicator_warmup.md` for full details. Short version:

```
limit = max_lookback_period + desired_output_bars
```

For `master_trend_15m.pine` with default params (atrPeriod=15, confirmBars=15):
- Warmup = atrPeriod + confirmBars = 15 + 15 = **30 bars**
- For 150 output bars: `limit = 30 + 150 = 180`

**Note:** Pine `input.int()` defaults are always used — the `inputs` parameter in `run()` is silently ignored. Change periods directly in the `.pine` file.

---

## Available Pine Outputs (master_trend_15m.pine)

| Plot name | Type | Description |
|---|---|---|
| `"Close"` | number | Current close price |
| `"Position"` | `-1 / 0 / 1` | Confirmed trend direction (0=pending confirmBars) |
