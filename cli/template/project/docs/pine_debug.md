# Pine Script Debugging Guide

## Context

This project runs Pine Script indicators via `@backtest-kit/pinets` against real exchange data fetched through `ccxt`. Use `@backtest-kit/cli --pine` to execute any `.pine` file and dump results to a JSONL file for inspection.

Key files:
- `math/*.pine` — Pine Script indicators

---

## Debug Workflow

### Step 1 — Add debug plots to Pine

Add named `plot()` calls for internal variables you want to inspect. Use `display=display.data_window` to mark bot-facing outputs (convention only — the CLI captures all named plots regardless):

```pine
// === OUTPUTS FOR BOT ===
plot(close,         "Close",          display=display.data_window)
plot(active_signal, "Signal",         display=display.data_window)

// === DEBUG ===
plot(ema_fast,             "EmaFast",        display=display.data_window)
plot(ema_slow,             "EmaSlow",        display=display.data_window)
plot(ema_fast - ema_slow,  "EmaGap",         display=display.data_window)
plot(bars_since_signal,    "BarsSinceSignal", display=display.data_window)
plot(last_signal,          "LastSignal",      display=display.data_window)
```

### Step 2 — Run and dump to JSONL

Use `--jsonl` to write output to a file instead of stdout. JSONL is preferred over Markdown for large outputs — each row is a self-contained JSON object, so an AI agent can read only the rows it needs without loading the full table into context.

Output is written to `<pine-dir>/dump/<output>.jsonl` — the directory is created automatically. By default `<output>` equals the `.pine` file name (without extension). Override with `--output`.

```bash
npx @backtest-kit/cli --pine ./math/my_indicator.pine \
  --symbol BTCUSDT \
  --timeframe 15m \
  --limit 180 \
  --when "2025-09-24T12:00:00.000Z" \
  --jsonl
# → ./math/dump/my_indicator.jsonl
```

Override the output name:

```bash
npx @backtest-kit/cli --pine ./math/my_indicator.pine \
  --jsonl \
  --output debug
# → ./math/dump/debug.jsonl
```

Or add to `package.json`:

```json
{
  "scripts": {
    "pine:debug": "npx @backtest-kit/cli --pine ./math/my_indicator.pine --symbol BTCUSDT --timeframe 15m --limit 180 --jsonl"
  }
}
```

```bash
npm run pine:debug
```

### Step 3 — Read the JSONL file

Each line is one bar:

```jsonl
{"Close":112871.28,"EmaFast":112500.10,"EmaGap":123.45,"BarsSinceSignal":0,"LastSignal":1,"Signal":1,"timestamp":"2025-09-22T15:00:00.000Z"}
{"Close":112666.69,"EmaFast":112480.55,"EmaGap":98.12,"BarsSinceSignal":1,"LastSignal":1,"Signal":1,"timestamp":"2025-09-22T15:15:00.000Z"}
```

Scan rows where `BarsSinceSignal == 0` to find signal transitions — that's where the crossover fired.

---

## CLI Flags

| Flag | Type | Description |
|------|------|-------------|
| `--pine` | boolean | Enable PineScript execution mode |
| `--symbol` | string | Trading pair (default: `"BTCUSDT"`) |
| `--timeframe` | string | Candle interval (default: `"15m"`) |
| `--limit` | string | Number of candles to fetch (default: `250`) |
| `--when` | string | End date for candle window — ISO 8601 or Unix ms (default: now) |
| `--exchange` | string | Exchange name (default: first registered, falls back to CCXT Binance) |
| `--output` | string | Output file base name without extension (default: `.pine` file name) |
| `--jsonl` | boolean | Write plots as JSONL (one row per line) to `<pine-dir>/dump/{output}.jsonl` — **preferred for debug** |
| `--json` | boolean | Write plots as a JSON array to `<pine-dir>/dump/{output}.json` |
| `--markdown` | boolean | Write Markdown table to `<pine-dir>/dump/{output}.md` |

**Important:** `limit` must cover indicator warmup bars — rows before warmup completes will show `N/A`.

---

## Exchange Configuration (pine.module)

By default the CLI registers CCXT Binance automatically — no setup needed for Binance spot.

To use a different exchange, create `modules/pine.module.ts` next to the `.pine` file (or at project root as fallback):

```
math/
├── my_indicator.pine
└── modules/
    └── pine.module.ts    ← loaded automatically before running
```

```typescript
// modules/pine.module.ts
import { addExchangeSchema } from "backtest-kit";
import ccxt from "ccxt";

addExchangeSchema({
  exchangeName: "my-exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.bybit({ enableRateLimit: true });
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
});
```

Then pass `--exchange my-exchange` to the CLI.

---

## Common Patterns

### N/A values
EMA of length N returns `N/A` for the first `N-1` bars — this is expected warmup behavior. `EmaFast` (len=8) starts at bar 8, `EmaSlow` (len=21) starts at bar 21.

### Diagnosing whipsaw
Look at `EmaGap` at the moment `LastSignal` changes (i.e. `BarsSinceSignal == 0`). If `|EmaGap|` is small (e.g. < 15), the crossover happened in a flat/noisy zone — likely a false signal.

### Diagnosing stale signals
`active_signal` goes to 0 when `bars_since_signal > signal_valid_bars`. If `Signal` is 0 but `LastSignal` is non-zero, the signal expired. Increase `signal_valid_bars` or check why the crossover didn't sustain.

---

## Adding Filters

Filters go into the entry condition expressions:

```pine
min_gap = input.float(15.0, "Min EMA Gap Filter", minval=0.0)

long_cond  = ta.crossover(ema_fast, ema_slow)  and math.abs(ema_gap) >= min_gap
short_cond = ta.crossunder(ema_fast, ema_slow) and math.abs(ema_gap) >= min_gap
```

Add the filter threshold as a debug plot, then check in JSONL: when `BarsSinceSignal` resets to 0, does `EmaGap` meet the threshold?

---

## Pine Variables Worth Plotting for Debug

| Variable | Purpose |
|---|---|
| `ema_fast - ema_slow` | Gap magnitude — key for noise filtering |
| `bars_since_signal` | How many bars since last crossover |
| `last_signal` | Raw last direction (1/-1/0), ignores expiry |
| `active_signal` | Final output after expiry window |
| `ta.rsi(close, 14)` | Momentum context |
| `ta.atr(14)` | Volatility context for dynamic thresholds |
| `volume` | Volume spike confirmation |
