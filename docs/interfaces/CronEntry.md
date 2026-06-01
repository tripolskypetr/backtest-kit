---
title: docs/interface/CronEntry
group: docs
---

# CronEntry

Configuration for a registered cron entry.

## Properties

### name

```ts
name: string
```

Unique name of the entry. Used as the dedup key on `register` (re-registering
the same name replaces the previous entry) and as part of the singleshot
coordination key.

Must be non-empty and must not contain `:` — `:` is reserved as the slot-key
segment separator and would otherwise create ambiguity between global and
fan-out fire-once keys.

### interval

```ts
interval: CandleInterval
```

Candle interval at whose boundaries the handler fires.
Same scale as {@link CandleInterval} used by `Interval` and `Cache`:
`"1m" &vert; "5m" | "1h" | "1d"` etc.

If omitted, the entry switches to **fire-once** mode: the handler is
invoked on the very first matching tick (no boundary check) and never
again. If the handler throws, the entry is **not** marked as fired and
will retry on the next tick.

### symbols

```ts
symbols: string[]
```

Symbol whitelist that doubles as the fan-out switch.

- **Empty/undefined → global singleshot**: across all parallel backtests
  the handler runs **once** per boundary. The first symbol to reach the
  boundary opens the slot; others await the same promise.
- **Non-empty → per-symbol fan-out**: ticks whose `symbol` is not in the
  list are skipped, and ticks whose `symbol` *is* in the list each open
  their own slot. The handler runs **once per whitelisted symbol** per
  boundary.

The same rule applies in fire-once mode: global → handler runs once
total; fan-out → once per whitelisted symbol.

Each symbol must not contain `:` (same reason as {@link CronEntry.name}).

### handler

```ts
handler: CronCallback
```

Handler invoked on the first parallel tick to reach a new boundary.
