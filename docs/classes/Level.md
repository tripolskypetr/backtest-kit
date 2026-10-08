---
title: docs/class/Level
group: docs
---

# Level

Step-function lookup keyed by position age in minutes.

Wraps a plain `Record&lt;number, number &vert; null&gt;` dictionary where
the key is the minute the threshold starts to apply and the value is the
threshold itself (`null` marks a stage with no threshold). Object keys are
strings at runtime — they are cast back to numbers internally. Resolution
picks the value of the LARGEST key that is `&lt;= age`; past the last key the
last value stays in effect indefinitely.

Like {@link State}, the class is split into context-free statics and
context-bound instance methods: `Level._getValue(levelMap, dto)` receives
the full context as arguments, while instance `getValue()` takes no
arguments — it resolves the pending signal, mode and logical timestamp from
`backtest.executionContextService` / `backtest.methodContextService`, so it
is only available inside strategy lifecycle callbacks (e.g.
`listenActivePing`). Position age is measured from the signal's `pendingAt`
to the logical `when` of the current tick — never from wall-clock time.

Primary use case — dynamic time stop: the loss tolerance (in % pnl) narrows
as the position ages, with thresholds derived from winner trajectories.

## Constructor

```ts
constructor(levelMap: Record<number, number>);
```

## Properties

### levelMap

```ts
levelMap: any
```

### _match

```ts
_match: (levelMap: Record<number, number>, dto: { minutesActive: number; }) => number
```

Context-free step-function resolution against an explicit age.
Object keys are cast from string to number before matching.
Returns the value of the largest key `&lt;= dto.minutesActive` (which may
itself be `null`), or `null` when the age is below the smallest key
(or the dictionary is empty).

### _getValue

```ts
_getValue: (levelMap: Record<number, number>, dto: { pendingAt: number; when: Date; }) => number
```

Context-free resolution of the value for a signal's age.
Receives the full context as arguments — no execution context required.
Age is computed as `(when - pendingAt) / 1min` from the logical timestamp.

### match

```ts
match: (minutesActive: number) => number
```

Step-function resolution of this instance's dictionary against an explicit age.

### getValue

```ts
getValue: () => Promise<number>
```

Resolve the value for the CURRENT pending signal's age.
Resolves the signal, mode and timestamp from execution context — no context arguments required.
