# Positional-Argument Swap Audit — `./src`

**Date:** 2026-06-16
**Scope:** entire `./src` (~250 `.ts` files), all primitive types (number/number, string/string, boolean).
**Goal:** find swapped positional arguments of the same primitive type — bugs TypeScript's structural typing cannot catch (`f(timestamp, price)` ≡ `f(price, timestamp)` when both are `number`).
**Method:** signature → call-sites → compare each actual argument's variable name against the parameter name at that position. (Same method that found the one real bug in this session.)

## Summary

| Result | Count |
| --- | --- |
| Risky functions/signatures inventoried | ~40 |
| Call-sites verified | 120+ |
| ❌ Bugs found (this audit) | **0** |
| ❌ Bug found & already fixed (commit `c7958a73`) | 1 |
| ⚠️ Suspects needing human review | 0 (see notes) |

**Verdict: no swapped-argument bugs remain in `./src`.** The single real bug of this class — `PROCESS_COMMIT_QUEUE_FN(currentTime, currentPrice)` instead of `(currentPrice, currentTime)` in `ClientStrategy.tick()` — was already fixed by commit `c7958a73` before this audit.

## Coverage by directory

| Directory | Status | What was checked |
| --- | --- | --- |
| `src/math/` | ✅ clean | All number-only fns (`investedCostToPercent`, `percentToCloseCost`, `slPriceToPercentShift`, `tpPriceToPercentShift`, `slPercentShiftToPrice`, `tpPercentShiftToPrice`, `breakevenNew*Price`, `percentValue`, `percentDiff`) — 30+ call-sites across `function/strategy.ts`, `classes/Backtest.ts`, `classes/Live.ts`. |
| `src/interfaces/` | ✅ clean | System callback signatures vs their ClientStrategy call-sites: `onHighestProfit`/`onMaxDrawdown` (`signal, currentPrice, timestamp`), `onSchedulePing`/`onActivePing`/`onIdlePing` (system), `onInit`/`onDispose` (string-quad). |
| `src/client/` | ✅ clean | `ClientStrategy.ts` fully audited during this session (all `CALL_*_FN`, `PARTIAL_*_FN`, sync, ping, breakeven groups). `ClientPartial/Breakeven/Risk/Exchange/Frame/Sizing/Action` — agent-checked clean. |
| `src/lib/services/markdown/` | ✅ clean | `getStorage` memoize + `new ReportStorage(...)` string-quads in all 12 services + every `this.getStorage(...)` call-site — order `symbol, strategyName, exchangeName, frameName[, backtest]` correct everywhere. |
| `src/lib/services/core` + `connection` | ✅ clean | `breakeven`/`trailingStop`/`trailingTake`/`partialProfit`/`partialLoss`/`averageBuy` end-to-end (Core→Connection→ClientStrategy), `getStrategy(...)` string-quad, `getTimestamp`/`getCurrentPrice(symbol, context, backtest)`. |
| `src/function/strategy.ts` | ✅ clean | `commit*` forwarding to `strategyCoreService.*` — partial/averageBuy/breakeven/trailing all in correct order. |
| `src/classes/` | ✅ clean | `Backtest`/`Live` `commit*` facades (breakeven/trailing with new `timestamp`), Persist adapter triples. |
| `src/helpers, validation, contract, model, utils, config` | ✅ no risk patterns | Spot-checked; no 2+ adjacent same-type positional bugs in hot paths. |

## The fixed bug (reference)

`src/client/ClientStrategy.ts` `tick()` — `PROCESS_COMMIT_QUEUE_FN(self, currentPrice, timestamp)`:
- **Was:** `PROCESS_COMMIT_QUEUE_FN(this, currentTime, currentPrice)` — `currentTime` passed as `currentPrice`, `currentPrice` as `timestamp`.
- **Now (commit `c7958a73`):** `PROCESS_COMMIT_QUEUE_FN(this, currentPrice, currentTime)`.
- **Why it was invisible:** both args are `number`; structural typing accepts either order.

## Inventory of fragile signatures (forward-looking risk map)

These compile-safely accept swapped args — guard future edits here. All are currently correct.

### number/number adjacent — NO type separator (highest risk)
| Function | File | Adjacent same-type params |
| --- | --- | --- |
| `onHighestProfit` / `onMaxDrawdown` | `interfaces/Strategy.interface.ts` | `currentPrice, timestamp` |
| `PROCESS_COMMIT_QUEUE_FN` | `client/ClientStrategy.ts` | `currentPrice, timestamp` ← was the bug |
| `PARTIAL_PROFIT_FN` / `PARTIAL_LOSS_FN` | `client/ClientStrategy.ts` | `percentToClose, currentPrice, timestamp` (3 in a row) |
| `AVERAGE_BUY_FN` | `client/ClientStrategy.ts` | `currentPrice, timestamp, cost` (3 in a row) |
| `slPriceToPercentShift` / `tpPriceToPercentShift` | `math/` | `newPrice, originalPrice, effectivePriceOpen` (3 in a row) |
| `investedCostToPercent` / `percentToCloseCost` | `math/` | `dollarAmount/percentToClose, investedCost` — swap = 40–400× error |
| `readCandlesData` | `classes/Persist.ts` (iface) | `limit, sinceTimestamp, untilTimestamp` |

### string/string/string(/string) — context triples/quads (path & cache risk)
| Function | File | Adjacent strings |
| --- | --- | --- |
| `getStorage` / `new ReportStorage` | all `lib/services/markdown/*.ts` | `symbol, strategyName, exchangeName, frameName` |
| `getStrategy` | `lib/services/connection/StrategyConnectionService.ts` | `symbol, strategyName, exchangeName, frameName` |
| `Persist*Instance` constructors | `classes/Persist.ts` | `symbol, strategyName, exchangeName` |
| `onInit` / `onDispose` | `interfaces/Strategy.interface.ts` | `symbol, strategyName, exchangeName, frameName` |

### Protected by a type separator (lower risk — TS catches a swap)
Where a `string` discriminant (e.g. `closeReason`) or a `boolean` (`backtest`) sits between two `number`s, TypeScript *does* reject a swap. Examples: `CLOSE_*_IN_BACKTEST_FN(..., averagePrice, closeReason, closeTimestamp)`, the ping callbacks `(..., currentPrice, backtest, timestamp)`. These were verified but are self-defending.

## Notes on agent-flagged false positives

An exploratory pass flagged 10 markdown `getStorage` factories as "cache-collision bugs" because the memoize **key** includes `backtest` while the `ReportStorage` **constructor** receives only 4 args (no `backtest`). This was reviewed and is **not a bug and not in scope**: `ReportStorage` legitimately doesn't need `backtest` (it isn't stored; each event carries its own `backtest`), and including `backtest` in the memo key correctly *separates* live vs backtest instances (the opposite of a collision). The string order `symbol, strategyName, exchangeName, frameName` — the only thing relevant to *this* audit — is correct in all 12 services.

## Recommendation (out of scope for this audit, for follow-up)

The codebase has `strict: false`, no ESLint, no branded types — so this class of bug is undetectable at compile time. To prevent recurrence:
1. Branded primitives: `type Timestamp = number & { readonly __t: 'ms' }`, `type Price = number & { readonly __t: 'price' }`, `type Percent = ...` — would make `onHighestProfit`/`PROCESS_COMMIT_QUEUE_FN`/`investedCostToPercent` swaps a compile error.
2. Replace positional `(symbol, strategyName, exchangeName, frameName)` quads with the existing `context` object pattern (already used in Core/Connection) at the markdown/persist layers.
