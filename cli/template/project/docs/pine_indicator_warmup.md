# Pine Script Warmup & Limit Calculation

## The Problem

Pine functions that look back over N bars (`ta.supertrend`, `ta.ema`, `ta.highest`, etc.) return `na` / `null` until they have enough bars to compute. If `limit` is too small, the entire output is N/A.

---

## Warmup Formula

```
warmup_bars = max_lookback_period + any_secondary_lookback
```

Examples:

```
// EMA golden cross
warmup = max(ema_slow_len=21) = 21 bars

// MasterTrend
warmup = atrPeriod(15) + confirmBars(15) = 30 bars
```

Rule: `limit` must be at least `warmup + desired_output_bars`.

For a meaningful output of ~150 bars:
```
limit = warmup + 150
```

---

## Timeframe → Limit Reference

Warmup for `master_trend_15m.pine` (atrPeriod=15, confirmBars=15 → warmup=30):

| Timeframe | Min limit (warmup only) | Limit for ~150 output bars | Real time covered |
|---|---|---|---|
| 5m  | 30 | 180 | ~15h |
| **15m** | 30 | **180** | **~45h** |
| 1h  | 30 | 180 | ~7.5 days |

---

## Diagnosing N/A Output

Symptom: all columns except `Close` show `N/A` from bar 0.

Check: count warmup bars in output — the index of the first non-null value.

```js
const posData = plots["Position"].data;
const firstValid = posData.findIndex((d) => d.value !== null && !isNaN(d.value));
console.log("Warmup bars:", firstValid);
// if firstValid === posData.length → limit too small, zero valid output
```

If `firstValid === posData.length` → increase `limit` by at least `warmup - limit + desired_output`.

---

## Stacked Lookbacks

When multiple lookback functions are chained, warmup is additive:

```pine
[supertrend, direction] = ta.supertrend(factor, atrPeriod)  // needs atrPeriod bars
// confirmBars counter needs confirmBars more bars after supertrend is valid
// total warmup = atrPeriod + confirmBars = 15 + 15 = 30
```

`ta.supertrend` itself uses ATR internally, so warmup = atrPeriod. The `confirmBars` confirmation window adds another `confirmBars` bars before `trend` stabilizes.

---

## Pine inputs cannot be set via run()

The `inputs` parameter in `run()` is silently ignored — Pine `input.int()` / `input.float()` defaults are always used.

To test different period values, change the defaults in the `.pine` file directly:

```pine
// change this line in the .pine file
atrPeriod = input(15, "ATR Period")  // → input(20, "ATR Period")
```

This means warmup changes when tuning params — recalculate `limit` after any period change.
