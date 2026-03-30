# Logging & JSONL — Coefficient Tuning Guide

## Purpose

`Log` from `backtest-kit` writes structured entries to a `.jsonl` file during backtests. Each line is a JSON object. After running a backtest, you analyse the file to understand why signals fired or were blocked, then adjust thresholds.

---

## Setup

Call `Log.useJsonl` **once at module level**, before any schema registrations:

```ts
import { Log } from "backtest-kit";

Log.useJsonl("bounce_strategy", "./dump/log");
// Writes to: ./dump/log/bounce_strategy.jsonl
```

Parameters:
- First arg: base filename (without extension)
- Second arg: directory path (created automatically if missing)

Each `Log.log / Log.info / Log.debug / Log.warn` call appends one JSON line to the file.

**Default mode is in-memory** — call `useJsonl` to activate file output. Other modes:
- `Log.useMemory()` — default, no file I/O
- `Log.useDummy()` — no-op, zero overhead
- `Log.usePersist()` — persistent adapter (db-backed)

---

## Log Levels

```ts
Log.log(topic, ...args)    // general events — use for signal opens
Log.debug(topic, ...args)  // diagnostic details — use for filter rejections
Log.info(topic, ...args)   // informational — use for per-tick snapshots
Log.warn(topic, ...args)   // warnings — unexpected but non-fatal conditions
```

`topic` is the first argument and becomes the log's searchable category. Always use a fixed string identifier. `args` are serialized as JSON in the `args` array of the log entry.

---

## ILogEntry Structure

Every written line has this shape:

```ts
interface ILogEntry {
  id:               string;   // unique entry id
  type:             "log" | "debug" | "info" | "warn";
  timestamp:        number;   // unix ms (wall clock)
  createdAt:        string;   // ISO date from backtest context
  topic:            string;   // first argument to Log.xxx()
  args:             unknown[]; // remaining arguments
  methodContext:    IMethodContext | null;
  executionContext: IExecutionContext | null;
}
```

`createdAt` reflects the **backtest simulation time** (the bar's timestamp), not the wall clock. This is what you use to correlate log entries with price history.

---

## Recommended Logging Pattern for Coefficient Tuning

Three topic categories cover everything needed:

### 1. `bar_snapshot` — every tick (Log.info)

Log all indicator values on **every** `getSignal` call, regardless of whether a signal fires. This gives you the full distribution of each metric.

```ts
Log.info("bar_snapshot", {
  // Pine extremes
  totalHighs:  extreme.totalHighs,
  totalLows:   extreme.totalLows,
  balance:     extreme.balance,
  trend:       extreme.trend,
  // GARCH
  movePercent: volume.movePercent,
  sigma:       volume.sigma,
  modelType:   volume.modelType,
  reliable:    volume.reliable,
  // Volume anomaly
  anomaly:     reversal.anomaly,
  confidence:  reversal.confidence,
  direction:   reversal.direction,
  imbalance:   reversal.imbalance,
});
```

After backtest: load the JSONL and look at the **percentile distribution** of each field. Example: if `movePercent` is > 0.7% only 5% of the time, your filter is very restrictive — consider lowering the threshold or you'll have very few trades.

### 2. `filter_rejected` — per failed filter (Log.debug)

Log **which** filter blocked the signal and the exact value that failed:

```ts
// Filter 1: volatility
if (!volume.reliable || volume.movePercent < MIN_MOVE_PERCENT) {
  Log.debug("filter_rejected", {
    reason:      "garch_low_vol",
    movePercent: volume.movePercent,
    threshold:   MIN_MOVE_PERCENT,
    reliable:    volume.reliable,
  });
  return null;
}

// Filter 2: extreme touches
if (extreme.totalHighs < MIN_TOTAL_TOUCHES && extreme.totalLows < MIN_TOTAL_TOUCHES) {
  Log.debug("filter_rejected", {
    reason:     "not_enough_touches",
    totalHighs: extreme.totalHighs,
    totalLows:  extreme.totalLows,
    threshold:  MIN_TOTAL_TOUCHES,
  });
  return null;
}

// Filter 3: anomaly
if (!reversal.anomaly) {
  Log.debug("filter_rejected", {
    reason:     "no_anomaly",
    confidence: reversal.confidence,
    threshold:  ANOMALY_CONFIDENCE,
  });
  return null;
}

// Filter 4: direction mismatch
if (!position) {
  Log.debug("filter_rejected", {
    reason:     "direction_mismatch",
    direction:  reversal.direction,
    isHighTest, isLowTest,
  });
  return null;
}
```

After backtest: count entries per `reason`. The most frequent rejection is your bottleneck. If `garch_low_vol` dominates — lower `MIN_MOVE_PERCENT`. If `no_anomaly` dominates — lower `ANOMALY_CONFIDENCE`.

### 3. `signal_open` — when a signal fires (Log.log)

Log the complete state at the moment a signal is created:

```ts
Log.log("signal_open", {
  position,
  tp,
  sl,
  totalHighs:  extreme.totalHighs,
  totalLows:   extreme.totalLows,
  balance:     extreme.balance,
  confidence:  reversal.confidence,
  direction:   reversal.direction,
  imbalance:   reversal.imbalance,
  movePercent: volume.movePercent,
  sigma:       volume.sigma,
  modelType:   volume.modelType,
});
```

After backtest: cross-reference `signal_open` entries with trade PNL to find which combination of values (e.g. `totalHighs >= 5 AND confidence > 0.85`) correlates with profitable trades.

---

## Analysing the JSONL File

The file at `./dump/log/bounce_strategy.jsonl` contains one JSON object per line.

**Quick shell inspection:**

```bash
# Count entries per topic
cat ./dump/log/bounce_strategy.jsonl | grep -o '"topic":"[^"]*"' | sort | uniq -c

# Count filter rejection reasons
cat ./dump/log/bounce_strategy.jsonl | python3 -c "
import sys, json
from collections import Counter
reasons = []
for line in sys.stdin:
    e = json.loads(line)
    if e['topic'] == 'filter_rejected' and e['args']:
        reasons.append(e['args'][0].get('reason','?'))
print(Counter(reasons))
"

# Extract all bar_snapshots as CSV for Excel
cat ./dump/log/bounce_strategy.jsonl | python3 -c "
import sys, json
rows = []
for line in sys.stdin:
    e = json.loads(line)
    if e['topic'] == 'bar_snapshot' and e['args']:
        d = e['args'][0]
        d['createdAt'] = e['createdAt']
        rows.append(d)
import csv
if rows:
    w = csv.DictWriter(sys.stdout, fieldnames=rows[0].keys())
    w.writeheader()
    w.writerows(rows)
"
```

---

## CONFIG Constants Pattern

Keep all tunable thresholds as named constants at the top of the strategy file:

```ts
// === CONFIG (tune before each backtest run) ===
const MIN_MOVE_PERCENT   = 0.7;   // garch filter: minimum 8h volatility
const RANGE_STEPS        = 32;    // predictRange horizon: 32 × 15m = 8h
const MIN_TOTAL_TOUCHES  = 3;     // extreme direction: min tests of high/low
const ANOMALY_CONFIDENCE = 0.75;  // volume-anomaly composite threshold
const PINE_LIMIT         = 300;   // Pine script warmup + output bars
const CANDLES_FOR_GARCH  = 1_000; // GARCH history length
const N_TRAIN            = 1200;  // volume-anomaly baseline window (trades)
const N_DETECT           = 200;   // volume-anomaly detection window (trades)
```

**Tuning workflow:**
1. Run backtest → check `filter_rejected` distribution in JSONL
2. Identify the bottleneck (dominant rejection reason)
3. Adjust the corresponding CONFIG constant
4. Re-run backtest
5. Repeat until signal frequency and PNL balance is acceptable

---

## Log File Location

| `useJsonl(name, dir)` call | Output path |
|---|---|
| `Log.useJsonl("bounce_strategy", "./dump/log")` | `./dump/log/bounce_strategy.jsonl` |
| `Log.useJsonl("debug", "./dump")` | `./dump/debug.jsonl` |

The directory is relative to the working directory where the CLI is invoked (project root).
