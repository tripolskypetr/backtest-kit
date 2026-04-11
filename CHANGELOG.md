# Peak/Fall Distance Queries (v6.10.0, 11/04/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/6.10.0)

v6.10.0 adds four new distance-query methods that measure how far a position has moved from its best and worst points

## New Distance-Query Methods

Four new methods are added symmetrically across every public layer (strategy functions, `BacktestUtils`, `LiveUtils`, `ClientStrategy`, `StrategyCoreService`, `StrategyConnectionService`, and `IStrategy`):

| Method | Formula | Semantic |
|---|---|---|
| `getPositionHighestProfitDistancePnlPercentage` | `max(0, peak% − current%)` | How much PnL% has been given back from the highest profit point |
| `getPositionHighestProfitDistancePnlCost` | `max(0, peakCost − currentCost)` | Same in absolute dollar terms |
| `getPositionHighestMaxDrawdownPnlPercentage` | `max(0, current% − fall%)` | How much PnL% has been recovered from the worst drawdown trough |
| `getPositionHighestMaxDrawdownPnlCost` | `max(0, currentCost − fallCost)` | Same in absolute dollar terms |

All four return `null` when there is no active pending signal, and `≥ 0` otherwise. They read from the existing `_peak` and `_fall` snapshots on `ISignalRow` introduced in v6.7.0.

## `Interval` — Generic Refactor

`TIntervalFn` and the two instance classes are now fully generic:

- **`TIntervalFn<T extends object>`** — replaces the concrete `(symbol, when) => Promise<ISignalIntervalDto | null>` signature. Any object type can be returned.
- **`TIntervalWrappedFn<T extends object>`** — new type for the wrapped function returned by `Interval.fn` and `Interval.file`. Callers pass only `symbol`; `when` is resolved internally from the execution context.
- **`IntervalFnInstance<T>`** — generic class; `run()` now returns `Promise<T | null>`.
- **`IntervalFileInstance<T>`** — generic class; `run(symbol)` signature replaces the previous variadic `...args`. The `symbol` is extracted before the call; `when` is pulled from the execution context inside `run`.
- `TIntervalFileFn` type alias is removed; `IntervalFileInstance` no longer uses it as its type parameter.

## Exports Added to `src/index.ts`

- `TIntervalFn` — exported from `./classes/Interval` so callers can type their own interval functions without importing from the internal path.
- `ISignalIntervalDto` — re-exported from `./interfaces/Strategy.interface` (was previously only available via the internal interface path).





# Once-per-Interval Signal Firing (v6.9.0, 10/04/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/6.9.0)


v6.9.0 adds two new utility classes — `Interval` for once-per-interval signal firing and `Position` for TP/SL level calculation — renames `CacheInstance` to `CacheFnInstance`, adds soft-delete support to `CacheFileInstance` and a new `PersistIntervalUtils` persistence layer.

## `Interval` — Once-per-Interval Signal Firing

New `src/classes/Interval.ts` provides a mechanism to fire a signal function at most once per candle-interval boundary per symbol.

- **`IntervalFnInstance`** — in-memory instance. Stores the last aligned timestamp per context+symbol key. On the first call within a new interval boundary the wrapped function is invoked; all subsequent calls within the same interval return `null`. If the function itself returns `null`, the countdown does not start and the next call retries.
- **`IntervalFileInstance`** — persistent file-based instance backed by `PersistIntervalAdapter` (stored under `./dump/data/interval/`). Fired state survives process restarts. Supports `clear()` to soft-delete all persisted records so the function fires again.
- **`IntervalUtils`** — utility class (exported as singleton `Interval`) with two factory methods:
  - `Interval.fn(run, { interval })` — wraps a `TIntervalFn` with in-memory once-per-interval firing. Returns the wrapped function plus a synchronous `clear()` method.
  - `Interval.file(run, { interval, name })` — wraps a `TIntervalFileFn` with persistent once-per-interval firing. Returns the wrapped function plus an async `clear()` method that deletes disk records.
  - `Interval.dispose(run)` — removes the memoized `IntervalFnInstance` for a specific function.
  - `Interval.clear()` — clears all memoized instances and resets the `IntervalFileInstance` index counter (call when `process.cwd()` changes between iterations).

### `ISignalIntervalDto`

New interface extending `ISignalDto` with a required `id: string` field (UUID v4). `TIntervalFn` and `TIntervalFileFn` return `Promise<ISignalIntervalDto | null>`.

## `Position` — TP/SL Level Calculator

New `src/classes/Position.ts` provides static helpers for calculating take-profit and stop-loss price levels. Direction is automatically inverted for short positions.

- **`Position.moonbag(dto)`** — fixed 50% TP from current price; SL at `percentStopLoss` from current price.
- **`Position.bracket(dto)`** — custom TP at `percentTakeProfit` and SL at `percentStopLoss` from current price.

Both methods accept `{ position: "long" | "short", currentPrice, percentStopLoss, ... }` and return `{ position, priceTakeProfit, priceStopLoss }`.

## `CacheInstance` Renamed to `CacheFnInstance`

`CacheInstance` is renamed to `CacheFnInstance` in `src/classes/Cache.ts` for naming consistency with `CacheFileInstance`. All internal references, error messages, and JSDoc examples are updated accordingly.

## `CacheFileInstance.clear()` — Soft-Delete All Cached Records

`CacheFileInstance` gains a new async `clear()` method that iterates all non-removed entries in the instance's bucket via `PersistMeasureAdapter.listMeasureData` and marks each one as removed via `PersistMeasureAdapter.removeMeasureData`. After this call the next `run()` recomputes and re-caches the value.

`Cache.file(...).clear()` is now `async` (was `void`), delegating to `CacheFileInstance.clear()` via the memoized instance accessor.

## `PersistMeasureUtils` — `removeMeasureData` + `listMeasureData`

Two new methods on `PersistMeasureUtils`:

- `removeMeasureData(bucket, key)` — soft-deletes a cached entry by setting `removed: true` on the stored record. Subsequent `readMeasureData` calls for the same key return `null`.
- `listMeasureData(bucket)` — async generator yielding all non-removed entity keys for a bucket.

`MeasureData` type gains a `removed: boolean` field; all `writeMeasureData` calls now include `removed: false` on new writes.

## `PersistIntervalUtils` — New Persistence Layer for `Interval.file`

New `PersistIntervalUtils` class (exported as `PersistIntervalAdapter`) stores fired-interval markers under `./dump/data/interval/`. Supports `readIntervalData`, `writeIntervalData`, `removeIntervalData`, `listIntervalData`, `clear`, `useJson`, `useDummy`, and `usePersistIntervalAdapter` for custom adapter injection.

`IntervalData` type: `{ id: string; data: unknown; removed: boolean }`.

## Exports

`Position`, `Interval`, `PersistIntervalAdapter`, and `IntervalData` are added to the public API in `src/index.ts` and `types.d.ts`.




# Code Refactoring (v6.8.1, 08/04/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/6.8.1)


v6.8.1 resolves circular import issues across the class layer by splitting monolithic files, extracting shared infrastructure into dedicated services, and converting `LoggerService` to a `singleton` factory so all DI consumers reference the same instance without importing through the `lib` barrel.

## `Action.ts` Split — `ActionBase` + `ActionProxy`

The 1100-line `Action.ts` is split into two focused files:

- **`ActionBase.ts`** — base class users extend to implement custom action handlers (state management, notifications, analytics). All `IPublicAction` methods have default no-op logging implementations. No longer imports from `src/lib` barrel, eliminating the circular dependency.
- **`ActionProxy.ts`** — internal proxy that wraps a user's `ActionBase` instance with error capture (`trycatch`), guard checks (pending/scheduled signal), and error emission. Imports `LoggerService` directly instead of through the `lib` barrel.

`Action.ts` now re-exports both classes for backwards compatibility.

## `MergeRisk` Extracted to `MergeRisk.ts`

`MergeRisk` (composite risk that ANDs multiple `IRisk` instances) is moved from `Risk.ts` into its own `src/classes/MergeRisk.ts`. It now uses `LoggerService` directly instead of the `bt` singleton from `lib`, removing the circular import.

## `Writer.ts` — Shared Infrastructure for Markdown and Report Classes

A new `src/classes/Writer.ts` extracts the common file-writing infrastructure that was duplicated between `Markdown.ts` and `Report.ts`:

- `MarkdownWriter` / `ReportWriter` — adapter classes managing file/folder JSONL writers with `singleshot` init, `timeout` writes, and `exitEmitter`/`shutdownEmitter` teardown
- `IMarkdownTarget` / `IReportTarget` — configuration interfaces for selective service enablement
- `TMarkdownBaseCtor` / `TReportBaseCtor` — constructor type aliases

`Markdown.ts` and `Report.ts` are now thin facades that compose the per-domain services (e.g. `BacktestMarkdownService`, `StrategyReportService`) with the shared writer infrastructure from `Writer.ts`.

## `ContextMetaService` — New DI Service

`src/lib/services/meta/ContextMetaService.ts` is a new `singleton` service that centralises the "get current timestamp" logic previously inlined in `getContextTimestamp.ts`:

- If an execution context is active, returns `executionContextService.context.when.getTime()`
- Otherwise returns `alignToInterval(new Date(), "1m").getTime()`

`getContextTimestamp.ts` now delegates entirely to `CONTEXT_META_SERVICE.getContextTimestamp()`, removing its direct import of `backtest` from the `lib` barrel.

## `LoggerService` Converted to `singleton`

`LoggerService` is now exported as a `singleton(class ...)` factory from `di-singleton`. Previously it was a plain `class`, which caused consumers to create independent instances. Now all DI lookups share one instance. Private fields and getters are renamed with `_` prefix to satisfy singleton class constraints:

- `_commonLogger` (was `private _commonLogger`)
- `_methodContext` (was `private get methodContext`)
- `_executionContext` (was `private get executionContext`)

All services that injected `LoggerService` by class reference now inject by `TLoggerService` type alias to avoid importing the concrete class.

## `IActionStrategy` Interface + `strategy` param on `IActionParams`

`IActionStrategy` is added to `Action.interface.ts`. It exposes `hasPendingSignal` and `hasScheduledSignal` — the two guard queries `ActionProxy` needs to skip callbacks when there is no active position. The `strategy` field is injected via `IActionParams` instead of being pulled from the `lib` barrel inside the class.

## `execution` Field on `IRiskParams`

`IRiskParams` gains an `execution: TExecutionContextService` field so risk implementations can access the current execution context (symbol, timestamp, backtest flag) without importing `lib` directly.

## Services Updated to Use `TLoggerService`

All services that previously typed their injected logger as `inject<LoggerService>(...)` now use `inject<TLoggerService>(...)`. Affected files span the full service tree: `BacktestLogicPublicService`, `LiveLogicPublicService`, `WalkerLogicPublicService`, all connection/schema/validation/report/markdown services, and `PriceMetaService` / `TimeMetaService`.

## `getDebugTimestamp` Removed

`src/helpers/getDebugTimestamp.ts` is deleted. Its functionality was already covered by `getContextTimestamp`.




# Max Drawdown Measure (v6.7.0, 06/04/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/6.7.0)


v6.7.0 adds a `_fall` tracking field to every active position — the symmetric counterpart to the existing `_peak` — that records the worst price reached in the loss direction during a position's lifetime. Six new utility methods expose this data for strategy logic, and all statistics models (backtest, live, heatmap) now include average peak/drawdown PNL metrics.

## `_fall` — Max Drawdown Snapshot on `ISignalRow`

Every pending signal now carries a `_fall` object alongside `_peak`:

```ts
signal._fall  // { price, timestamp, pnlPercentage, pnlCost }
signal._peak  // { price, timestamp, pnlPercentage, pnlCost }
```

`_fall` is initialised at position open (`price = priceOpen`, `pnl = 0`) and updated on every tick/candle when price moves toward the stop-loss:

- **LONG**: updated when `currentPrice < _fall.price` (new low below entry)
- **SHORT**: updated when `currentPrice > _fall.price` (new high above entry)

## New API Methods

Six new functions are exported from `backtest-kit` and available on both `BacktestUtils` and `LiveUtils`:

| Method | Returns | Description |
|---|---|---|
| `getPositionHighestProfitMinutes(symbol)` | `number \| null` | Minutes since the peak profit price (alias for `getPositionDrawdownMinutes`) |
| `getPositionMaxDrawdownMinutes(symbol)` | `number \| null` | Minutes since the worst loss price was recorded |
| `getPositionMaxDrawdownPrice(symbol)` | `number \| null` | Worst price reached in loss direction |
| `getPositionMaxDrawdownTimestamp(symbol)` | `number \| null` | Timestamp (ms) when the worst price was recorded |
| `getPositionMaxDrawdownPnlPercentage(symbol)` | `number \| null` | PnL % at the moment of deepest drawdown |
| `getPositionMaxDrawdownPnlCost(symbol)` | `number \| null` | PnL in quote currency at deepest drawdown |

All methods return `null` when there is no active position.

```ts
import {
  getPositionMaxDrawdownPnlPercentage,
  getPositionMaxDrawdownMinutes,
} from "backtest-kit";

const drawdownPct = await getPositionMaxDrawdownPnlPercentage("BTCUSDT");
// e.g. -5.2 (deepest PnL % reached during this position)

const minutesSinceWorst = await getPositionMaxDrawdownMinutes("BTCUSDT");
// e.g. 15 (how long ago the trough occurred)
```

## Statistics Models — `avgPeakPnl` / `avgFallPnl`

`BacktestStatisticsModel`, `LiveStatisticsModel`, and `IHeatmapRow` each gain two new fields:

```ts
avgPeakPnl: number | null  // avg _peak.pnlPercentage across all trades (higher is better)
avgFallPnl: number | null  // avg _fall.pnlPercentage across all trades (closer to 0 is better)
```

`HeatmapStatisticsModel` exposes the portfolio-wide trade-count-weighted versions:

```ts
portfolioAvgPeakPnl: number | null
portfolioAvgFallPnl: number | null
```

## Report Columns

Backtest, live, and heatmap table views now include two new columns: **Peak PNL** and **Max DD PNL**.

## Markdown Report Lines

Backtest and live summary markdown blocks now include:

```
**Avg Peak PNL:** +8.45% (higher is better)
**Avg Max Drawdown PNL:** -3.12% (closer to 0 is better)
```

The heatmap portfolio header line also includes these two metrics inline.




# Walker Strategy Dump Isolation (v6.4.0, 04/04/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/6.4.0)

v6.4.0 introduces a universal `clear()` lifecycle across all major adapters and a new `Setup` class that encapsulates the full initialization sequence. The Walker now properly tears down and re-initialises state between strategy iterations, fixing cross-contamination of memoized instances when `process.cwd()` changes.

## `Setup` — Centralised Init/Teardown for CLI

```ts
import { Setup } from "@backtest-kit/cli";

Setup.clear();  // tears down all adapters and resets the singleshot
Setup.enable(); // idempotent — safe to call multiple times
```

`Setup` is a singleton (`SetupUtils`) exported from `@backtest-kit/cli`. Its `enable()` method (backed by `singleshot`) runs the full adapter wiring that was previously scattered across `config/setup.ts`. `clear()` tears down every adapter and resets `enable` so the next call starts fresh.

`WalkerMainService` now calls `Setup.clear(); Setup.enable()` before loading each strategy entry point — ensuring that path-dependent singletons (Persist storage roots, Log file handles, Cache instances) are rebuilt with the current `process.cwd()` rather than reusing stale instances from the previous run.

## Cache API Changes

### `Cache.fn` / `Cache.file` — `clear()` and `gc()` on the returned function

```ts
const cachedFn = Cache.fn(fetchData, { interval: "1h" });

cachedFn.clear(); // clears cached value for current execution context
cachedFn.gc();    // removes expired entries, returns count removed
```

`Cache.fn()` now returns `T & { clear(): void; gc(): number | undefined }` and `Cache.file()` returns `T & { clear(): void }`. Cache management is now done via methods on the wrapped function instead of passing the original function as an argument to `Cache.*` static calls.

### `Cache.clear(fn)` → `Cache.dispose(fn)` / `Cache.flush()` removed

| Old API | New API |
|---|---|
| `Cache.clear(fn)` | `fn.clear()` |
| `Cache.gc(fn)` | `fn.gc()` |
| `Cache.flush(fn)` | `Cache.dispose(fn)` |
| `Cache.flush()` | `Cache.clear()` |

`Cache.dispose(fn)` removes the memoized `CacheInstance` for a specific function across all contexts. `Cache.clear()` (no arguments) disposes all fn and file instances and resets the `CacheFileInstance` index counter — used by `Setup.clear()` during Walker teardown.

## Universal `clear()` on All Adapters

Every major adapter now exposes a `clear()` method that resets its memoized or path-dependent state:

| Adapter | What `clear()` resets |
|---|---|
| `Broker` | `_brokerInstance` + `enable` singleshot |
| `Dump` | `getInstance` memoization |
| `Log` | replaces `_log` with a fresh `LogMemoryUtils` |
| `Markdown` | `getMarkdownStorage` memoization |
| `Memory` | `getInstance` memoization |
| `Report` | `getReportStorage` memoization |
| `StorageBacktest` | resets to `StorageMemoryBacktestUtils` |
| `StorageLive` | resets to `StoragePersistLiveUtils` |
| `NotificationBacktest` | resets to `NotificationMemoryBacktestUtils` |
| `NotificationLive` | resets to `NotificationMemoryLiveUtils` |
| All `Persist*` adapters | clears the respective memoized storage factory |

## `dispose()` Rename in Notification and PersistMemory

`INotificationUtils.clear()` is renamed to `dispose()` across all implementations (`NotificationMemory*`, `NotificationPersist*`, `NotificationDummy*`, `NotificationBacktestAdapter`, `NotificationLiveAdapter`) to disambiguate from the new cache-reset `clear()` added to the adapter wrappers.

Similarly, `PersistMemoryUtils.clear(signalId, bucketName)` (which removed a single signal's storage key) is renamed to `dispose(signalId, bucketName)`, while `PersistMemoryUtils.clear()` (no args) is the new cache-reset method.




# Walker A/B Strategy Comparison for CLI (v6.2.0, 03/04/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/6.2.0)


v6.2.0 introduces the `--walker` CLI mode for side-by-side A/B comparison of multiple strategy variants against the same historical data. It also extends the positionals API to support multiple entry points and adds the `walker.module` hook slot.

## CLI: `--walker` — Multi-Strategy Comparison

```bash
node index.mjs --walker ./content/v1.strategy.ts ./content/v2.strategy.ts ./content/v3.strategy.ts
node index.mjs --walker --symbol BTCUSDT --noCache --markdown ./content/v1.ts ./content/v2.ts
```

Runs all provided strategy entry points against the same exchange and frame, then prints a comparison report to stdout or saves it to `./dump/`.

### Walker flags

| Flag | Default | Description |
|---|---|---|
| `--symbol` | `BTCUSDT` | Trading pair |
| `--cacheInterval` | `1m,15m,30m,1h,4h` | Comma-separated intervals to pre-cache |
| `--noCache` | — | Skip candle cache warming before the run |
| `--verbose` | — | Log every candle fetch and strategy lifecycle event to stdout |
| `--output` | `walker_{SYMBOL}_{TIMESTAMP}` | Output file base name |
| `--json` | — | Save results as JSON to `./dump/<output>.json` |
| `--markdown` | — | Save report as Markdown to `./dump/<output>.md` |

Each positional argument is a strategy entry point. All strategy files are loaded without changing `process.cwd()` — `.env` is read from the working directory only. `addWalkerSchema` is called automatically using the first registered exchange and frame. After comparison completes the report is printed to stdout (or saved when `--json`/`--markdown` is set).

### Module hook

`modules/walker.module` is loaded automatically when `--walker` is active, matching the pattern of `backtest.module`, `paper.module`, etc.

### Graceful shutdown

`SIGINT` stops any in-progress Walker run cleanly before the process exits.




# AI-Assisted Strategy Workflow (v6.0.0, 31/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/6.0.0)

The central theme of v6.0 is first-class support for AI-driven strategy development. A new `--init` CLI command scaffolds a complete project that an AI coding assistant (Claude Code, Cursor, etc.) can work in end-to-end — from market research and PineScript prototyping to backtesting and reporting — without any manual setup.

## CLI: `--init` — Project Scaffold for AI Agents

```bash
npx @backtest-kit/cli@6.0.0 --init --output my-project
```

Creates a ready-to-use project directory and fetches library documentation. Refuses to run if the target directory already exists and is non-empty. Files with `.mustache` extension are rendered via Mustache (project name substituted); `package.json` and `.gitignore` are generated from templates.

### Project structure

```
├── content/                  # Strategy entry points (.ts)
│   └── feb_2026.strategy.ts
├── docs/                     # Documentation
│   ├── lib/                  # Auto-fetched library READMEs (via sync:lib)
│   └── *.md                  # Backtest Kit how-to guides
├── math/                     # PineScript indicator files (.pine)
│   └── feb_2026.pine
├── modules/                  # Side-effect module hooks (loaded automatically)
│   ├── dump.module.ts        # Exchange schema for --dump mode
│   └── pine.module.ts        # Exchange schema for --pine mode
├── report/                   # Strategy research reports (.md)
│   └── feb_2026.md
├── scripts/
│   └── fetch_docs.mjs        # Downloads library READMEs into docs/lib/
├── CLAUDE.md                 # AI-agent guide for writing strategies
└── package.json
```

### `CLAUDE.md` — AI strategy writing guide

A prescriptive workflow for AI coding assistants covering the full loop from market research to a profitable strategy:

**Per-month discipline** — one `.pine` + one `.strategy.ts` per calendar month; cross-month backtests are forbidden (commission whipsaw makes them mathematically meaningless).

**Research-first** — agent must read negative news for the target period and correlate it with a candle dump before writing any code. No brute-force parameter iteration.

**`--dump` driven analysis** — dump candles first, identify the dominant structure (bear/bull/range), then design the entry logic around it.

**Hard quality rules** — no HOLD, no infinite trailing SL, TP ≥ 1% (exchange charges 0.2% each way), minimum 1 signal/day (3 trades is luck, not a strategy).

**Deliverable spec** — `.pine` header must contain honest `sharpeRatio`, `avgPnl`, `stdDev`, trade list with timestamps and PnL; accompanied by a `report/<month>.md` market analysis.

### Embedded `docs/` guides

| File | Topic |
|---|---|
| `backtest_strategy_structure.md` | Strategy schemas, `getSignal`, callbacks |
| `backtest_actions.md` | `commitPartialProfit`, `commitPartialLoss`, `commitAverageBuy` |
| `backtest_graph_pattern.md` | `sourceNode` / `outputNode` pattern |
| `backtest_graph_multiple_outputs.md` | Multiple simultaneous graph outputs |
| `backtest_pinets_usage.md` | Running PineScript with `@backtest-kit/pinets` |
| `backtest_logging_jsonl.md` | JSONL dump logging from strategies |
| `backtest_risk_async.md` | Async risk management patterns |
| `pine_debug.md` | Debugging PineScript indicators |
| `pine_indicator_warmup.md` | Indicator warmup and bar indexing |

`scripts/fetch_docs.mjs` downloads `README.md` from: `backtest-kit`, `backtest-kit/graph`, `backtest-kit/pinets`, `backtest-kit/ollama`, `backtest-kit/cli`, `garch`, `volume-anomaly`, `agent-swarm-kit`, `functools-kit` into `docs/lib/`.

## CLI: `--dump` — Raw Candle Export

```bash
node index.mjs --dump --symbol BTCUSDT --timeframe 15m --limit 500 --when "2026-02-28T00:00:00Z" --jsonl
```

Fetches OHLCV candles from the registered exchange and writes them to `./dump/`. Used by AI agents to analyse market structure before writing a strategy.

| Flag | Default | Description |
|---|---|---|
| `--symbol` | `BTCUSDT` | Trading pair |
| `--timeframe` | `15m` | Candle interval |
| `--limit` | `250` | Number of candles |
| `--when` | now | End date — ISO 8601 or Unix ms |
| `--exchange` | first registered | Exchange name |
| `--output` | `{SYMBOL}_{LIMIT}_{TF}_{TS}` | Output file base name |
| `--json` | — | Save as JSON array to `./dump/<output>.json` |
| `--jsonl` | — | Save as JSONL to `./dump/<output>.jsonl` |

Exchange schema is loaded from `./modules/dump.module` automatically.

## CLI: `--help` and `--version`

`--help` prints a full usage reference covering all modes, flags, module hooks, and environment variables.
`--version` prints `@backtest-kit/cli <version>`.

## CLI: `--pine` output path fix

`--json`, `--jsonl`, `--markdown` changed from `string` (explicit path) to `boolean` flag. Output is always written to `./dump/<name>.<ext>` where `<name>` defaults to the Pine file basename; `--output` overrides the base name.

## Backend: Signal Validation

Four validator functions added and exported from `backtest-kit`:

| Function | Description |
|---|---|
| `validateSignal(signal, currentPrice)` | Top-level: branches pending vs scheduled, returns `bool` |
| `validateCommonSignal(signal)` | Position, finite prices, TP/SL direction and distance |
| `validatePendingSignal(signal, currentPrice)` | Pending: `currentPrice` between SL and TP |
| `validateScheduledSignal(signal, currentPrice)` | Scheduled: `priceOpen` between SL and TP |

Call `validateSignal` inside `getSignal` to catch bad values early. The common/pending/scheduled variants are `@deprecated` internal exports for unit tests.

## Backend: `CC_ENABLE_TRAILING_EVERYWHERE`

```typescript
GLOBAL_CONFIG.CC_ENABLE_TRAILING_EVERYWHERE = true;
```

Activates trailing take / trailing stop without waiting for absorption conditions. Default: `false`.

## Backend: `frameEndTime` in backtest

`IStrategy.backtest` gains a required `frameEndTime: number` parameter. Propagated through `BacktestLogicPrivateService` → `StrategyCoreService`. A new `CLOSE_PENDING_FN` closes any still-active signal at frame end; emits a fatal error if the signal remains active afterward.

## Backend: New Intervals

`CandleInterval` extended with `"1d"`, `"1w"`. `FrameInterval` extended with `"1w"`, `"1M"`. `ExchangeService` and `AxisProviderService` updated with correct minute counts (1440 / 10080).




# Pine Script CLI Runner (v5.10, 26/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/5.10)

## CLI: Pine Script runner

A new `--pine` entry point has been added to the CLI. Passing `--pine` together with a `.pine` file path runs the script against live exchange data and prints results without requiring a full backtest strategy setup.

```bash
npx @backtest-kit/cli ./math/master_trend_15m.pine --pine --symbol BTCUSDT --timeframe 15m --limit 10 --markdown=output.md
```

### New CLI flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--pine` | boolean | false | Enable Pine Script execution mode |
| `--timeframe` | string | `"15m"` | Candle interval passed to the script |
| `--limit` | string | `"250"` | Number of candles to fetch |
| `--when` | string | now | ISO date string — end timestamp for the candle window |
| `--json <path>` | string | — | Write extracted rows as a JSON array to a file |
| `--jsonl <path>` | string | — | Write extracted rows as newline-delimited JSON to a file |
| `--markdown <path>` | string | — | Write the Markdown report to a file |

When none of `--json`, `--jsonl`, or `--markdown` is given the Markdown table is printed to stdout.




# Trading Agent Memory System (v5.9, 23/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/5.9)

## Backend: Memory Subsystem

A new `Memory` class has been added providing per-signal, per-bucket key-value storage with built-in BM25 full-text search. Two backends are available:

| Class | Storage | BM25 Index |
|---|---|---|
| `MemoryLocalInstance` | In-process only (no persistence) | In-memory, rebuilt on each run |
| `MemoryPersistInstance` | Disk-backed via `PersistMemoryAdapter` (crash-safe atomic writes) | Rebuilt from disk on `waitForInit` |

Storage layout for `MemoryPersistInstance`: `./dump/memory/<signalId>/<bucketName>/<memoryId>.json`

The backend can be swapped via `Memory.useLocal()`, `Memory.usePersist()`, or a custom `TMemoryInstanceCtor` via `Memory.useMemoryAdapter()`.

### Public API (static methods on `Memory`)

| Method | Description |
|---|---|
| `Memory.writeMemory({ signalId, bucketName, memoryId, value, index? })` | Write a value; `index` overrides the BM25 index string |
| `Memory.readMemory({ signalId, bucketName, memoryId })` | Read a single entry; throws if not found |
| `Memory.searchMemory({ signalId, bucketName, query, settings? })` | BM25 search; returns `{ memoryId, score, content }[]` |
| `Memory.listMemory({ signalId, bucketName })` | List all entries; returns `{ memoryId, content }[]` |
| `Memory.removeMemory({ signalId, bucketName, memoryId })` | Remove a single entry |

### Context-bound helpers (auto-resolve signalId from execution context)

```typescript
import { writeMemory, readMemory, searchMemory, listMemory, removeMemory } from "backtest-kit";

await writeMemory({ bucketName: "my-strategy", memoryId: "context", value: { trend: "up" } });
const ctx = await readMemory<{ trend: string }>({ bucketName: "my-strategy", memoryId: "context" });
const hits = await searchMemory({ bucketName: "my-strategy", query: "bullish trend" });
const all = await listMemory({ bucketName: "my-strategy" });
await removeMemory({ bucketName: "my-strategy", memoryId: "context" });
```

> These helpers are marked `@deprecated` — prefer the static `Memory.*` methods with an explicit `signalId` for clarity.

### BM25 search engine (`createSearchIndex`)

A standalone BM25 index utility is now exported. Supports incremental `upsert`/`remove` with O(1) DF updates (no full recompute), configurable `k1`, `b`, and minimum score threshold.

## Backend: Dump Subsystem Refactor

The dump API has been fully redesigned. The old `dumpMessages` function is replaced by a class-based system with pluggable backends.

### New `Dump` class

| Method | Description |
|---|---|
| `Dump.dumpAgentAnswer(messages, ctx)` | Persist full LLM chat history |
| `Dump.dumpRecord(record, ctx)` | Persist a flat key-value object |
| `Dump.dumpTable(rows, ctx)` | Persist an array of objects as a table |
| `Dump.dumpText(content, ctx)` | Persist raw text or markdown |
| `Dump.dumpError(content, ctx)` | Persist an error description |
| `Dump.dumpJson(json, ctx)` | Persist an arbitrary nested object as fenced JSON *(deprecated — prefer `dumpRecord`)* |

### Dump backends

| Class | Description |
|---|---|
| `DumpMarkdownInstance` | Writes `.md` files to `./dump/agent/{signalId}/{bucketName}/{dumpId}.md`; idempotent (skips if file exists) |
| `DumpMemoryInstance` | Writes to `Memory` (BM25-indexed, searchable via `Memory.searchMemory`) |
| `DumpBothInstance` | Dual-writes to both backends in parallel via `Promise.all` |

The backend is swapped via `Dump.useMarkdown()`, `Dump.useMemory()`, `Dump.useBoth()`, or a custom `TDumpInstanceCtor` via `Dump.useDumpAdapter()`.

### Context-bound helpers

```typescript
import { dumpAgentAnswer, dumpRecord, dumpTable, dumpText, dumpError, dumpJson } from "backtest-kit";

await dumpAgentAnswer({ bucketName: "my-strategy", dumpId: "reasoning-1", messages, description: "BTC long signal reasoning" });
await dumpRecord({ bucketName: "my-strategy", dumpId: "ctx", record: { price: 42000 }, description: "Signal context" });
await dumpTable({ bucketName: "my-strategy", dumpId: "candles", rows: [...], description: "Recent candles" });
```

> These helpers are marked `@deprecated` — prefer `Dump.*` with an explicit `signalId`.

### `MessageModel` type

A new `MessageModel` interface is exported covering all LLM message roles (`system`, `user`, `assistant`, `tool`) including `tool_calls`, `tool_call_id`, `reasoning_content`, and `images` fields.

## Backend: Persist — `PersistMemoryAdapter`

A new `PersistMemoryUtils` / `PersistMemoryAdapter` has been added for crash-safe memory entry persistence.
Storage layout: `./dump/memory/<signalId>/<bucketName>/<memoryId>.json`

Custom adapters can be registered via `PersistMemoryAdapter.usePersistMemoryAdapter(Ctor)`.

`MeasureData` type is now explicitly typed as `{ id: string; data: unknown }` instead of `unknown`.

## Backend: API surface

New exports in `backtest-kit`:

- Classes: `Memory`, `Dump`
- Types: `IMemoryInstance`, `TMemoryInstanceCtor`, `IDumpInstance`, `IDumpContext`, `TDumpInstanceCtor`, `MessageModel`, `MessageRole`, `MessageToolCall`, `MemoryData`, `PersistMemoryAdapter`
- Functions: `writeMemory`, `readMemory`, `searchMemory`, `listMemory`, `removeMemory`, `dumpAgentAnswer`, `dumpRecord`, `dumpTable`, `dumpText`, `dumpError`, `dumpJson`




# Price Charts, Heatmap Page & Status Banner (v5.8, 20/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/5.8)

## Frontend: Price Chart Page

<img width="3932" height="1992" alt="image" src="https://github.com/user-attachments/assets/5246c443-6a45-470b-99f3-77065c9dfe2b" />

A new `/price_chart` page with three-level navigation has been added for browsing candlestick data for any symbol in real time.

### Route structure

| Route | Component | Description |
|---|---|---|
| `/price_chart` | `FirstView` | Symbol button grid with coin icon and brand color |
| `/price_chart/:symbol` | `SecondView` | Interval selector: 1m / 15m / 1h |
| `/price_chart/:symbol/:interval` | `ThirdView` | Chart + signal info panel |

## Frontend: Heatmap Page

<img width="1920" height="951" alt="screenshot31" src="https://github.com/user-attachments/assets/24e31c11-a906-4ad8-a1d6-c1d8838328b0" />

A new `/heat` page has been added showing a per-symbol performance heatmap for the active strategy.

| Field | Description |
|---|---|
| Total PNL | Cumulative PNL in % |
| Win Rate | Percentage of profitable trades |
| Profit Factor | Ratio of gross profit to gross loss |
| Max Drawdown | Maximum drawdown in % |
| Expectancy | Expected profit per trade in % |
| Trades | Total number of trades |

Header shows the symbol ticker. Card body contains `IconPhoto` (128×128) and fields rendered via `OneTyped`.

## Frontend: StatusInfo Banner on the Main Page

<img width="1920" height="950" alt="screenshot19" src="https://github.com/user-attachments/assets/6c594757-109e-4a93-a9d3-3743d4cc8825" />

A new `StatusInfo` component has been added to the main page (`MainPage`) — a collapsible info banner displaying portfolio-level statistics for the active strategy.

### Behaviour

- Collapsed and semi-transparent by default (opacity 0.35); becomes fully opaque on hover.
- Clicking it expands to show a markdown rendering with:
  - Strategy name, exchange, frame, and mode (Backtest / Live).
  - Portfolio Total PNL, Sharpe Ratio, total trades.
  - Per-symbol breakdown: PNL, Win Rate, Profit Factor, Max Drawdown, Expectancy, Trades.
- The `Download` icon button downloads the markdown report without expanding the banner.
- Refreshes via `reloadSubject` (shared with the Refresh action button).

## Frontend: Main Menu Updates (MainPage)

<img width="1920" height="950" alt="screenshot19" src="https://github.com/user-attachments/assets/5efc180c-0810-4215-ad44-1a92d95103ad" />

### New navigation buttons

Two new routes added to the **Other** group:

| Button | Route | Icon | Color |
|---|---|---|---|
| Price Charts | `/price_chart` | `CandlestickChartTwoTone` | `#1565C0` |
| Heatmap | `/heat` | `LeaderboardTwoTone` | `#8D6E63` |

### Replaced breadcrumb actions

The old `status-action` and `notification-action` entries have been replaced with heatmap export actions:

| Action | Description |
|---|---|
| `download-json` | Download Heatmap JSON |
| `download-markdown` | Download Heatmap Markdown |
| `download-pdf` | Download Heatmap PDF |
| `update-now` | Refresh (invalidates `statusViewService` cache) |




# Hold Signals & Dump Explorer (v5.7, 18/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/5.7)

## Frontend: Dump Explorer Page

<img width="3992" height="2040" alt="image" src="https://github.com/user-attachments/assets/a5e979ba-f4b7-4e44-a39e-db6700e87bd9" />

A new `/dump` route and `DumpPage` have been added to the frontend. The page renders a navigable file tree rooted at the `dump/` directory in the CLI working directory. Users can browse directories and open any file for inspection without leaving the UI.


### `DumpPage` / `MainView`

- `RecordView` from `react-declarative` renders the tree with expand/collapse and live search.
- Directories show a folder icon; files show a type-specific icon (image, JSON, text, generic).
- Clicking a file opens `useDumpContentView` modal.
- A **Refresh** breadcrumb action clears the service cache and reloads the tree.

### `useDumpContentView` — file content modal

`useDumpContentView` (`useMarkdownReportView`-style tabbed modal) renders the content of any dump file:

| MIME type | Rendered as |
|---|---|
| `text/markdown` | Markdown (existing renderer) |
| `application/json` / code | Ace syntax-highlighted code editor |
| Other text | Raw text via `CodeEditor` |

Action buttons in the modal header:

- **Copy** (`CopyIcon`) — copies raw text to clipboard.
- **Download** — saves the file via browser download.
- **Print** (markdown only) — renders markdown to PDF/print view.

### `CodeEditor` component — Ace 1.4.12 bundled

A new `CodeEditor` component (`packages/front/modules/frontend/src/components/common/CodeEditor.tsx`) embeds the Ace editor loaded from `/3rdparty/ace_1.4.12/`. Features:

- Theme `chrome` (light) / `twilight` (dark-mode ready).
- Mode `ace/mode/javascript` as default (JSON and markdown modes prepared but commented out until workers are tuned).
- `Ctrl-F` / `Cmd-F` triggers a `layoutService.prompt("Find text")` dialog and jumps to the first occurrence.
- Web workers disabled to avoid CSP issues in embedded mode.

The Ace distribution (`ace.js`, `mode-javascript.js`, `worker-javascript.js`, `theme-chrome.js`, `theme-twilight.js`) is bundled under `packages/front/modules/frontend/public/3rdparty/ace_1.4.12/`.

## Markdown Report View: strategy tab & JSON export

`useMarkdownReportView` now fetches and displays a **Strategy** report tab alongside the existing backtest/live/performance/heat/sync/partial/breakeven/risk/schedule tabs.

A **Download JSON** action was added to the modal (via the new `MenuIcon` component): it serialises the full raw signal dataset for the currently displayed report to a `.json` file and triggers a browser download.

```
MenuIcon (⋮ menu) exposes:
  • Download Markdown  — existing behaviour
  • Download JSON      — new: serialises report data to JSON
```

The `CopyIcon` component is now also available on the strategy tab — copies the JSON representation of the strategy statistics to clipboard.


## Infinite-lifetime signals (`minuteEstimatedTime: Infinity`)

`ISignalDto.minuteEstimatedTime` is now **optional**. When omitted it defaults to `GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES`. Setting it to `Infinity` removes the timeout entirely — the position stays open until TP/SL fires or `closePending()` is called explicitly.

```typescript
addStrategySchema({
  strategyName: "hold-btc",
  getSignal: async (symbol) => ({
    priceOpen: 42000,
    priceTakeProfit: 50000,
    priceStopLoss: 38000,
    minuteEstimatedTime: Infinity, // no expiry
  }),
});
```

## CLI: triple-path module resolution

`ModuleConnectionService` now searches three locations in order when loading a hot-module file:

1. `<cwd>/modules/<fileName>` — project-local override
2. `<OVERRIDE_MODULES_DIR>/<fileName>` — package-level override directory
3. `<DEFAULT_MODULES_DIR>/<fileName>` — built-in default modules

Previously only two paths were checked (override + cwd/modules).

## New tests

- `test/e2e/hold.test.mjs` — end-to-end tests for `minuteEstimatedTime = Infinity` signals: activation, DCA, partial closes, SL/TP with infinite lifetime.
- `test/e2e/candle_cache.test.mjs` — end-to-end tests for `PersistCandleAdapter` and `getCandles` / `getRawCandles` behaviour across cache boundaries.
- `test/spec/candle_cache.test.mjs` — unit tests for candle cache correctness.





# Highest Profit Tracking & Markdown Report Viewer (v5.6, 13/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/5.6)

## Highest Profit Tracking

A new real-time profit peak tracker has been added to both live and backtest engines. Every active signal now maintains a `_peak` record that is updated on each tick whenever price moves further in the profit direction:

- **LONG**: tracks the highest VWAP price seen above the effective entry
- **SHORT**: tracks the lowest VWAP price seen below the effective entry

The record stores `{ price, timestamp, pnlPercentage, pnlCost }` and is initialised at position open with the entry price and `pendingAt` timestamp.

### New query functions (callable from strategy callbacks)

| Function | Returns |
|---|---|
| `getPositionHighestProfitPrice(symbol)` | Best price reached in profit direction |
| `getPositionHighestProfitTimestamp(symbol)` | Unix timestamp when the peak was recorded |
| `getPositionHighestPnlPercentage(symbol)` | PnL % at the peak price |
| `getPositionHighestPnlCost(symbol)` | PnL in quote currency at the peak price |
| `getPositionHighestProfitBreakeven(symbol)` | Whether breakeven was reachable at the peak |
| `getPositionDrawdownMinutes(symbol)` | Minutes elapsed since the peak was recorded |
| `getPositionEstimateMinutes(symbol)` | Original estimated hold duration (`minuteEstimatedTime`) |
| `getPositionCountdownMinutes(symbol)` | Remaining minutes before the position expires (≥ 0) |

All eight functions are also available on `Backtest.*` and `Live.*` class APIs with an explicit execution context parameter.

### `highestProfitSubject` event emitter

A new `highestProfitSubject` (type `Subject<HighestProfitContract>`) fires every time a new peak is recorded. The event payload carries `symbol`, `currentPrice`, `timestamp`, `strategyName`, `exchangeName`, `frameName`, `signal`, and a `backtest` flag.

Two new listener helpers are exported:

- `listenHighestProfit(fn)` — queued async subscription (events processed sequentially)
- `listenHighestProfitOnce(filterFn, fn)` — one-shot listener with a filter predicate

### `HighestProfit` utility class

`HighestProfit` (singleton exported from `backtest-kit`) provides three methods for post-run analysis:

- `HighestProfit.getData(symbol, context, backtest?)` — returns `HighestProfitStatisticsModel` with aggregated event history
- `HighestProfit.getReport(symbol, context, backtest?, columns?)` — returns a markdown-formatted table string
- `HighestProfit.dump(symbol, context, backtest?, path?, columns?)` — writes the report to `./dump/highest_profit/` (configurable)

### New exports

- `HighestProfitContract` — event contract interface
- `HighestProfitStatisticsModel` — statistics model
- `HighestProfitEvent` — individual event type
- `HighestProfit` — utility singleton

---

## Markdown Report Viewer (frontend)

The `packages/front` server now exposes two new REST route groups:

- **`/api/v1/markdown_mock/*`** — serves pre-built mock JSON fixtures from `mock/markdown/data/` for UI development without a live backend
- **`/api/v1/markdown_view/*`** — proxies real data from the running engine (falls back to mock when `MOCK=true`)

Both route groups cover all report types: `backtest`, `live`, `breakeven`, `risk`, `partial`, `highest_profit`, `schedule`, `performance`, `sync`, `heat`, and `walker`.

### `ReportPage` & `useMarkdownReportView` hook (frontend module)

A new `/report` page has been added to the frontend. It renders a tabbed report viewer backed by `MarkdownViewService` (DI service). Each tab corresponds to one report type and is powered by a dedicated view component (`BacktestView`, `LiveView`, `PartialView`, `HighestProfitView`, etc.).

The `useMarkdownReportView` hook manages tab state, route synchronisation, and lazy data fetching. A `CopyIcon` component is included to copy report markdown to the clipboard.



# Minor Improvements (v5.5.2, 11/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/5.5.2)


## Core: Live Timestamps Aligned to Candle Interval

In live and paper trading the wall-clock `new Date()` was used directly as the tick timestamp (`when`), which caused the timestamp to fall between candle boundaries and produced mismatches when comparing live state to backtest replays. All four call sites now pass the current time through `alignToInterval(new Date(), "1m")` before using it as the execution context timestamp:

- `Exchange.ts` — `GET_TIMESTAMP_FN` (used by `getAveragePrice` / `getCandles` outside backtest context)
- `Log.ts` — `GET_DATE_FN` (timestamp written to each log entry)
- `getContextTimestamp.ts` — helper consumed by strategy callbacks
- `LiveLogicPrivateService.ts` — `when` variable that seeds the execution context on every live tick

This ensures that timestamps emitted during live execution are always snapped to the start of the current 1-minute candle, matching the granularity used in backtests.

## CLI: Extension Resolution Moved into ClientLoader

Previously `ModuleConnectionService` contained its own `getExtVariants` helper and a `LOADER_FACTORY` loop that probed `.cjs / .mjs / .ts / .tsx / .js` variants by calling `fs.access` in sequence. The logic was fragile and duplicated resolution concerns that belong in the loader itself.

The resolution is now centralised in `ClientLoader`:

- `GET_EXT_VARIANTS_FN` — returns a priority-ordered list of candidate paths for a given filename, covering both the bare name and all known extensions.
- `GET_RESOLVED_EXT_FN` — picks the first existing variant using `fs.existsSync`, called transparently at the top of `ENTRY_FACTORY` before attempting `require` or Babel eval.
- `ClientLoader.check(filePath)` — new public method that resolves the path and returns `true` if any variant exists on disk, without actually importing the module. Exposed via `ILoader` interface and `LoaderService.check`.

`ModuleConnectionService` was simplified to use `loaderService.check` + `loaderService.import` in sequence, removing the now-redundant `LOADER_FACTORY` function and `getArgs` import.

## CLI: Module Entry-Point Convention Changed to `.module` Suffix

The three main services now load the user's entry file with an explicit `.module` suffix:

| Service | Before | After |
|---|---|---|
| `BacktestMainService` | `./backtest` | `./backtest.module` |
| `LiveMainService` | `./live` | `./live.module` |
| `PaperMainService` | `./paper` | `./paper.module` |

This disambiguates the strategy entry point from other files in the working directory and makes the expected filename convention explicit.

## CLI: Transpilation Errors Now Exit with a Diagnostic Message

The `TRANSPILE_FN` inside `ClientLoader` previously let exceptions from `eval` propagate silently. It now wraps the `eval` call in a try/catch: on failure it prints a structured message containing the error text, `__filename`, and `__dirname`, then calls `process.exit(-1)` so the CLI terminates cleanly instead of hanging.

## UI: Dashboard Number Formatting Fixes

Two fields in the strategy status panel were displaying raw JavaScript numbers:

- **Total Closed %** — was using `${partialExecuted}%`; now uses `${partialExecuted.toFixed(2)}%` for a consistent two-decimal display.
- **Average Price** — was using `priceOpen.toLocaleString()` (locale-dependent, variable precision); now uses `priceOpen.toFixed(2)` for a stable two-decimal format.

## Docs: New API Reference Pages

Documentation added for recently introduced services and interfaces:

- `PriceMetaService` — tracks the latest market price per symbol/strategy/exchange/frame key outside of a tick execution context.
- `TimeMetaService` — analogous service for time metadata.
- `ActivePingContract` / `SchedulePingContract` — callback contracts for active ping and scheduled ping lifecycle hooks.
- `CancelScheduledCommitNotification` / `ClosePendingCommitNotification` — notification payload interfaces.
- `IStrategy` expanded with new optional callback fields.
- UML diagram (`docs/uml.puml` and `assets/uml.svg`) updated to reflect current architecture.




# TypeScript Module Loader for Strategy Files (v5.5, 10/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/5.5)

## CLI: Custom Module Loader with Babel Transpilation

Previously the CLI could only load strategy files written as plain CJS modules. Any `.ts` or ESM file required a separate build step before the CLI could consume it. This change implements a runtime module loader — conceptually similar to a webpack loader pipeline — that allows a single strategy to freely mix `.ts`, `.mjs`, and `.cjs` source files without any pre-compilation.

### How it works

`ClientLoader` (new class in `cli/src/client/ClientLoader.ts`) operates as a self-contained runtime module system:

1. **CJS fast-path** — in CJS mode the file is loaded via a proxied `require`. The proxy intercepts known package IDs (`backtest-kit`, `@backtest-kit/ui`, `@backtest-kit/graph`, `@backtest-kit/ollama`, `@backtest-kit/pinets`, `@backtest-kit/signals`, `@backtest-kit/cli`) and redirects them to pre-registered `globalThis` singletons, so the strategy shares the exact same object instances as the CLI runtime.

2. **Babel transpile + eval fallback** — if `require` fails (ESM mode or `.ts` source), the file is read from disk, passed through `BabelService.transpile` (Babel with `plugin-transform-modules-umd`), and executed via `eval` inside a sandboxed scope that injects `require`, `__filename`, `__dirname`, `module`, and `exports`. The result is extracted from `module.exports`.

3. **Recursive forking for relative imports** — when a loaded file itself calls `require('./something')`, the proxied `require` detects the relative path and calls `loader.fork(newBasePath).import(resolved)`, spawning a child `ClientLoader` rooted at the new directory. This means an entire tree of relative imports is resolved transparently, just as webpack would traverse the dependency graph.

The net effect: a strategy entry point can `require('./indicators/rsi')` where `rsi.ts` is TypeScript, which in turn requires `./utils.mjs` — all resolved at runtime without any build tooling on the user side.

### `LoaderService`

New DI service (`cli/src/lib/services/base/LoaderService.ts`) wraps `ClientLoader` with per-`basePath` memoization via `functools-kit/memoize`, so repeated `import` calls to the same base directory reuse the same loader instance. Injected into both `ResolveService` (strategy entry point) and `ModuleConnectionService` (module hot-loading).

### `BabelService` — responsibility narrowed

`transpileAndRun` removed: execution context is now fully owned by `ClientLoader`. `BabelService` is reduced to a pure transpiler implementing the new `IBabel` interface (`transpile(code: string): string`). The `globalThis` population and `Window` type augmentation moved to `ClientLoader.ts` where they belong.

### `ModuleConnectionService` — load chain simplified

The previous triple-strategy chain (`REQUIRE_MODULE_FACTORY` → `IMPORT_MODULE_FACTORY` → `BABEL_MODULE_FACTORY`) is replaced by a single `LOADER_FACTORY` that delegates to `LoaderService.import`. File-existence is checked via `fs.access` before attempting to load. Errors are now only printed when `--verbose` is passed.

### New interfaces

- `IBabel` (`cli/src/interfaces/Babel.interface.ts`) — contract for the transpiler, decouples `ClientLoader` from the concrete `BabelService`
- `ILoaderParams` (`cli/src/interfaces/Loader.interface.ts`) — constructor params for `ClientLoader` (`path`, `babel`, `logger`)




# Overlap Detection & Status Dashboard (v5.0, 09/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/5.0)

## Status Dashboard

<img width="1920" height="1304" alt="image" src="https://github.com/user-attachments/assets/f2a9d293-30da-419f-81a3-910094ebd253" />

A new `/status` route and `StatusPage` have been added to the frontend. The page visualises the current live position in real time:

- **4 indicator widgets** — PNL %, PNL $, Invested $, Total Entries
- **Price Levels chart** (`StatusWidget` / `StockChart`) — entry levels, TP, SL and trailing lines rendered with Chart.js
- **Averaging panel** (`AveragingWidget`) — DCA entry ladder with cost basis per level
- **Partials panel** (`PartialWidget`) — executed partial close history

Chart.js scales (`CategoryScale`, `LinearScale`, `BarElement`, `LineElement`, `PointElement`) are now registered globally in `setup.ts`.


## Overlap Detection API

Two new guard functions prevent duplicate DCA entries and partial closes at the same price zone.

### `getPositionEntryOverlap` / `getPositionPartialOverlap`

Returns `true` if `currentPrice` falls inside the tolerance band of any existing DCA level or partial close price. The tolerance band is configured via `IPositionOverlapLadder` (default ±1.5%).

```typescript
import { getPositionEntryOverlap, getPositionPartialOverlap } from "backtest-kit";

// Skip DCA if price is already too close to an existing entry
if (!await getPositionEntryOverlap("BTCUSDT", currentPrice)) {
  await commitAverageBuy("BTCUSDT");
}

// Skip partial if price is already too close to a previous partial close
if (!await getPositionPartialOverlap("BTCUSDT", currentPrice)) {
  await commitPartialProfit("BTCUSDT", 50);
}
```

### `getPositionEntries`

Returns the full list of DCA entries (price + cost per entry) for the current pending signal. Returns `null` if no active position exists; returns a single-element array if no DCA has been performed.

```typescript
import { getPositionEntries } from "backtest-kit";

const entries = await getPositionEntries("BTCUSDT");
// No DCA:      [{ price: 43000, cost: 100 }]
// One DCA:     [{ price: 43000, cost: 100 }, { price: 42000, cost: 100 }]
```





# Broker Adapter & Order Integrity (v4.0, 04/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/4.0)

## Broker Adapter API

A pluggable broker integration layer that intercepts every trade-mutating operation **before** the internal state is modified. If the broker adapter throws, the DI-core mutation is never reached and position state remains unchanged — providing transaction-like guarantees over exchange order placement.

### How it works

Every `commit*` call in `Live.ts`, `Backtest.ts`, and `strategy.ts` now follows a strict three-phase sequence:

```
1. validate*()    — pure pre-flight checks (returns false, never throws)
2. Broker.commit*() — forward to exchange adapter (throws → abort, state unchanged)
3. coreService.*()  — mutate internal position state
```

In backtest mode (`payload.backtest === true`) all broker calls are silently skipped so existing test suites require no changes.

### New exports

| Export | Kind | Description |
|---|---|---|
| `Broker` | singleton | Global `BrokerAdapter` instance — entry point for all broker operations |
| `IBroker` | interface | Adapter contract — implement to connect a real exchange |
| `TBrokerCtor` | type | Constructor overload accepted by `Broker.useBrokerAdapter` |
| `BrokerSignalOpenPayload` | type | Payload for `onSignalOpenCommit` — position activation |
| `BrokerSignalClosePayload` | type | Payload for `onSignalCloseCommit` — position close (SL/TP/manual) |
| `BrokerPartialProfitPayload` | type | Payload for `onPartialProfitCommit` — partial close at profit |
| `BrokerPartialLossPayload` | type | Payload for `onPartialLossCommit` — partial close at loss |
| `BrokerTrailingStopPayload` | type | Payload for `onTrailingStopCommit` — SL adjustment with `newStopLossPrice` |
| `BrokerTrailingTakePayload` | type | Payload for `onTrailingTakeCommit` — TP adjustment with `newTakeProfitPrice` |
| `BrokerBreakevenPayload` | type | Payload for `onBreakevenCommit` — SL moved to entry, TP unchanged |
| `BrokerAverageBuyPayload` | type | Payload for `onAverageBuyCommit` — DCA entry with `cost` and `currentPrice` |

### `Broker.useBrokerAdapter`

Registers the adapter. Accepts either a class constructor or an already-instantiated object implementing `Partial<IBroker>` (all methods are optional — unimplemented ones are silently skipped via `BrokerProxy`).

```typescript
import { Broker, IBroker, BrokerPartialProfitPayload } from "backtest-kit";

class MyBroker implements Partial<IBroker> {
  async onPartialProfitCommit(payload: BrokerPartialProfitPayload) {
    await exchange.createOrder({
      symbol: payload.symbol,
      side: "sell",
      quantity: payload.cost / payload.currentPrice,
    });
  }
}

// Register via constructor (called with `new` internally)
Broker.useBrokerAdapter(MyBroker);

// Or via instance
Broker.useBrokerAdapter(new MyBroker());
```



# Signal Sync & Custom Entry Cost (v3.9, 04/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.9)

## Signal Sync API

A new synchronization hook lets external order-management systems confirm every limit-order fill before the framework mutates internal state. If the callback returns `false` or throws, the position open/close is skipped and retried on the next tick.

### New exports

| Export | Kind | Description |
|---|---|---|
| `Sync` | class | Utility for querying signal-sync statistics and generating markdown reports |
| `listenSync(fn)` | function | Subscribe to all `signal-open` / `signal-close` sync events |
| `listenSyncOnce(filterFn, fn)` | function | One-shot filtered sync listener |
| `SignalSyncContract` | type | Discriminated union (`SignalOpenContract \| SignalCloseContract`) |
| `SignalOpenContract` | type | Emitted when a scheduled limit order is filled (position activated) |
| `SignalCloseContract` | type | Emitted when a pending position is closed for any reason |
| `SyncStatisticsModel` | type | Data returned by `Sync.getData()` |
| `SyncEvent` | type | Individual event row in sync statistics |

### `onSignalSync` callback

`IAction` and `IActionCallbacks` now expose `onSignalSync(event, ...)`. Throw inside to block the transition — framework will retry on the next tick. Exceptions are **not** swallowed here.

```typescript
addActionSchema({
  actionName: "my-action",
  callbacks: {
    async onSignalSync(event, actionName, strategyName, frameName, backtest) {
      if (event.action === "signal-open") {
        const ok = await exchange.confirmFill(event.signalId);
        if (!ok) throw new Error("Fill not confirmed");
      }
      if (event.action === "signal-close") {
        await exchange.cancelOco(event.signalId);
      }
    }
  }
});
```

### `Sync` report utility

```typescript
import { Sync } from "backtest-kit";

const stats = await Sync.getData("BTCUSDT", { strategyName, exchangeName, frameName });
// { totalEvents: 14, openCount: 7, closeCount: 7, events: [...] }

const md = await Sync.getReport("BTCUSDT", { strategyName, exchangeName, frameName });
await Sync.dump("BTCUSDT", { strategyName, exchangeName, frameName }, false, "./dump/sync");
```

## Custom Entry Cost

Each DCA entry now carries its own `cost` field (USD invested for that entry). Previously, all entries assumed a fixed `$100`. The default is controlled by the new `CC_POSITION_ENTRY_COST` config parameter (still `100` by default).

### Breaking change: `_partial.effectivePrice` → `_partial.costBasisAtClose`

Partial close records no longer store a pre-computed `effectivePrice`. Instead they store `costBasisAtClose` — the running dollar cost-basis snapshot **before** the partial fires. Effective price is now computed on-the-fly:

```
effectivePrice = costBasisAtClose / Σ(entry.cost / entry.price  for entries[0..entryCountAtClose])
```

This removes a stale-value risk and makes the accounting fully replay-correct. Migrate any persisted state or custom serialization that referenced `_partial[i].effectivePrice`.

### `getEffectivePriceOpen` / `computeEffectivePriceAtPartial`

`getEffectivePriceOpen` now uses a **cost-weighted harmonic mean** (`Σcost / Σ(cost/price)`) instead of a simple harmonic mean. The exported helper `computeEffectivePriceAtPartial` is used internally by both `getEffectivePriceOpen` and `toProfitLossDto`.

## Enhanced PNL (`IStrategyPnL`)

`toProfitLossDto` now returns two additional fields:

| Field | Description |
|---|---|
| `pnlCost` | Absolute P&L in USD: `pnlPercentage / 100 × pnlEntries` |
| `pnlEntries` | Total invested capital in USD (sum of all entry costs) |

All commit-event contracts (`StrategyCommit.contract`) now include a `pnl: IStrategyPnL` field — available on cancel, close, partial profit/loss, trailing stop/take, breakeven, average-buy, and activate events. A `totalPartials` field is also added to every commit event.

## API changes

| Change | Detail |
|---|---|
| `getPendingSignal(symbol, currentPrice)` | Now requires `currentPrice` (used for live PNL snapshot) |
| `getScheduledSignal(symbol, currentPrice)` | Same — `currentPrice` added |
| `hasPendingSignal(symbol)` | New — returns `true` if an active pending signal exists |
| `IPublicSignalRow` | Gains `cost`, `totalPartials`, `pnl`, `timestamp` fields |
| `ISignalEntry` | Gains `cost: number` field |

## Telegram notifications

Two new Mustache templates are added to the CLI:

- `signal-open.mustache` — "📬 Order Filled (Open)" — sent when a limit buy/sell is confirmed
- `signal-close.mustache` — "📭 Order Filled (Close)" — sent when a position exits

Both templates include symbol, direction, prices, DCA entry count, partial count, PNL, and signal ID.

---




# DCA-Aware Position Inspection (v3.8, 03/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.8)


## New position inspection API

Nine new functions are now available both as standalone imports and as methods on `Backtest` / `Live`:

| Function | Description |
|---|---|
| `getTotalPercentClosed(symbol)` | % of position still held (100 = nothing closed) |
| `getTotalCostClosed(symbol)` | Dollar cost-basis still held after partials |
| `getPositionAveragePrice(symbol)` | Harmonic-mean DCA entry price |
| `getPositionInvestedCount(symbol)` | Number of DCA entries made |
| `getPositionInvestedCost(symbol)` | Total invested dollars (entries × $100) |
| `getPositionPnlPercent(symbol, currentPrice)` | Unrealized PNL % at current price |
| `getPositionPnlCost(symbol, currentPrice)` | Unrealized PNL in dollars at current price |
| `getPositionLevels(symbol)` | Array of all DCA entry prices (`[priceOpen, ...averageBuy prices]`) |
| `getPositionPartials(symbol)` | Array of all partial close records for the current position |

All functions return `null` when no pending signal exists. `getPositionLevels` returns a single-element array `[priceOpen]` when no DCA entries have been made. `getPositionPartials` returns an empty array `[]` when no partial closes have been executed yet.

```typescript
import { getPositionLevels, getPositionPartials } from "backtest-kit";

// Inspect DCA ladder
const levels = await getPositionLevels("BTCUSDT");
// No DCA:   [43000]
// One DCA:  [43000, 42000]
// Two DCA:  [43000, 42000, 41500]

// Inspect partial close history
const partials = await getPositionPartials("BTCUSDT");
// [{ type: "profit", percent: 30, price: 44000, effectivePrice: 43000, entryCountAtClose: 1 }, ...]
```

## New dollar-amount partial-close API

`commitPartialProfitCost` and `commitPartialLossCost` accept a dollar amount instead of a percentage, removing the need to manually compute the equivalent percent. The library converts the dollar amount using `getPositionInvestedCost` internally.

```typescript
import { commitPartialProfitCost, commitPartialLossCost } from "backtest-kit";

// Close $150 worth of position at profit
await commitPartialProfitCost("BTCUSDT", 150);

// Cut $100 of position at loss
await commitPartialLossCost("BTCUSDT", 100);
```

## New utility exports

| Export | Description |
|---|---|
| `investedCostToPercent(dollarAmount, investedCost)` | Convert a dollar amount to a close percentage |
| `percentDiff(a, b)` | Percentage difference between two numbers |
| `percentValue(yesterday, today)` | Percentage change from one value to another |

Helper internals are now also publicly exported for advanced use: `toProfitLossDto`, `getEffectivePriceOpen`, `getTotalClosed`.

## Reworked cost-basis & PNL algorithm

### `getEffectivePriceOpen` — harmonic mean + partial replay

The effective entry price now uses the **harmonic mean** of all DCA entry prices (correct for fixed-dollar DCA). When partial closes are present the function replays the cost-basis sequence to compute the remaining position's effective price after each close, so DCA entries added *after* a partial are treated correctly.

### `toProfitLossDto` — dollar-weight PNL

PNL weighting is now based on the **actual dollar value** of each partial relative to `totalInvested`. Previously weights were the raw close percentage, which gave wrong results when `commitAverageBuy` was called between partial closes.

Cost-basis replay per partial:
```
costBasis = 0
for each partial[i]:
  costBasis += (entryCountAtClose[i] - entryCountAtClose[i-1]) × $100
  partialDollarValue[i] = (percent[i] / 100) × costBasis
  weight[i]             = partialDollarValue[i] / totalInvested
  costBasis            *= (1 - percent[i] / 100)
```

Each partial's PNL is now computed against the **effective entry price snapshot** (`effectivePrice`) captured at the moment `commitPartialProfit/Loss` was called.

## Data model changes

`_partial` entries now carry two additional fields:

| Field | Type | Purpose |
|---|---|---|
| `entryCountAtClose` | `number` | Number of `_entry` items at the time of this partial — enables cost-basis replay |
| `effectivePrice` | `number` | DCA-averaged entry price at the time of this partial — used for PNL calculation |
| `debugTimestamp` | `number?` | Execution-context timestamp for debugging |

`_entry` items now carry an optional `debugTimestamp` field.

## New config flag: `CC_ENABLE_DCA_EVERYWHERE`

`setConfig({ CC_ENABLE_DCA_EVERYWHERE: true })` removes the strict "must be a new low/high" requirement for `commitAverageBuy`. When enabled the engine accepts any `commitAverageBuy` call regardless of whether the current price breaks the previous entry record. Defaults to `false` (original strict behavior preserved).

## Frontend: AverageBuyCommitView

New `useAverageBuyCommitView` hook and accompanying views (`Candle1mView`, `Candle15mView`, `Candle1hView`) display a live DCA commit form with multi-timeframe candle charts. The hook integrates with `LayoutService` and the notification system to show the current DCA state during live trading.




# Measure Cache & Synchronized Timestamps (v3.7, 02/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.7)

## `Cache.file` — persistent file-based caching for external API calls

New `Cache.file` method wraps any async function with disk-backed caching. On cache hit the result is read from disk; on miss the function is called and the result is written. Cache entries are automatically invalidated when the aligned candle timestamp changes, so each candle interval gets its own isolated bucket.

### Usage

```typescript
import { Cache } from "backtest-kit";

const fetchIndicator = async (symbol: string, period: number) => {
  return await externalApi.fetch(symbol, period);
};

// Default key — one cache entry per symbol
const cachedFetch = Cache.file(fetchIndicator, { interval: "1h", name: "fetchIndicator" });

// Custom key — one cache entry per symbol + period combination
const cachedFetch = Cache.file(fetchIndicator, {
  interval: "1h",
  name: "fetchFearGreedIndex",
  key: ([symbol, alignMs, period]) => `${symbol}_${alignMs}_${period}`,
});

const result = await cachedFetch("BTCUSDT", 14);
```

### Cache key structure

| Part | Value |
|---|---|
| Bucket (directory) | `{name}_{interval}_{index}` — static per instance, no timestamp to avoid directory spam |
| Dynamic key (file) | Result of the `key` function; defaults to `{symbol}_{alignedTimestamp}` |

Cache files are stored under `./dump/data/measure/`.

```
dump/data/measure/
├── fetchIndicator_1h_0/          ← bucket: {name}_{interval}_{index}
│   ├── BTCUSDT_1743465600000.json     ← entityKey: {symbol}_{alignMs}
│   ├── BTCUSDT_1743469200000.json
│   └── ETHUSDT_1743465600000.json
└── fetchFearGreedIndex_1h_1/
    ├── BTCUSDT_1743465600000.json
    └── BTCUSDT_1743469200000.json
```

### `PersistMeasureAdapter` — pluggable storage backend

The underlying persistence layer is exposed as a global singleton. You can swap it out with a custom adapter or disable it entirely:

```typescript
import { PersistMeasureAdapter } from "backtest-kit";

PersistMeasureAdapter.useDummy();                        // discard all writes (useful in tests)
PersistMeasureAdapter.useJson();                         // restore default JSON adapter
PersistMeasureAdapter.usePersistMeasureAdapter(MyCtor);  // custom adapter
```

---

## Synchronized timestamps in logs and reports

All timestamp usages across `Markdown`, `Report`, `*ReportService`, and `*MarkdownService` now go through `getContextTimestamp()` instead of `Date.now()`:

- **During backtest** — returns the simulated candle time from `ExecutionContextService.context.when`, so log and report entries are aligned with strategy time rather than wall-clock time.
- **During live** — falls back to `Date.now()`, behaviour unchanged.




# Navigation Hub (v3.5.1, 01/03/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.5.1)

## ✨ Portfolio Overview, PNL Performance, System Logs

<img width="3008" height="1972" alt="image" src="https://github.com/user-attachments/assets/e8022824-4cf1-4531-8e45-52f71b28464f" />

`MainPage` has been redesigned from a tabbed view into a tile-based navigation hub. Each tile is a large colored button that routes to a dedicated section of the application.

Available routes:

- **Portfolio Overview** (`/overview`) — tabbed view with Backtest / Live signal lists
- **PNL Performance** (`/dashboard`) — equity and drawdown dashboard
- **System Logs** (`/logs`) — execution log viewer

The logo and app title in the header now navigate back to `/main` instead of opening the GitHub repository.




# Aggregated Trades, Log Adapter & Indicator Inputs (v3.5, 28/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.5)

## Log Adapter

<img width="1920" height="948" alt="image" src="https://github.com/user-attachments/assets/4a54685f-e5c8-4d84-9c2d-cf9ba815e312" />

New `Log` singleton with pluggable storage backends for recording backtest/live execution events. Timestamps are taken from the backtest execution context so log entries align with strategy time rather than wall-clock time.

### `Log` — new global singleton

```typescript
import { Log } from "backtest-kit";

// Write log entries
await Log.log("myStrategy.tick", { price: 42000 });
await Log.debug("myStrategy.debug", someData);
await Log.info("myStrategy.info", someData);
await Log.warn("myStrategy.warn", someData);

// Retrieve stored entries
const entries = await Log.getList();
// [{ id, type, timestamp, createdAt, topic, args }, ...]
```

**Switching backends:**

```typescript
Log.usePersist();   // persist to ./dump/data/log/ (survives restarts)
Log.useMemory();    // in-memory only (default)
Log.useDummy();     // discard all writes

// Custom adapter
Log.useLogger(MyLogClass);
```


## Aggregated Trades API

New `getAggregatedTrades` function added to the public exchange API. Fetches tick-level trade data backwards from the current execution context time with built-in look-ahead bias prevention.

### `getAggregatedTrades` — new public function

```typescript
import { getAggregatedTrades } from "backtest-kit";

// Fetch last hour of trades (one CC_AGGREGATED_TRADES_MAX_MINUTES window)
const trades = await getAggregatedTrades("BTCUSDT");

// Fetch last 500 trades with automatic backwards pagination
const lastTrades = await getAggregatedTrades("BTCUSDT", 500);
// [{ id, price, qty, timestamp, isBuyerMaker }, ...]
```

**Algorithm:**
- Aligns `to` down to the nearest minute boundary to prevent look-ahead bias
- Without `limit`: returns one `CC_AGGREGATED_TRADES_MAX_MINUTES`-wide window (default 60 min)
- With `limit`: paginates backwards in windows until enough trades are collected, then slices to exact count

**New config parameters:**

| Parameter | Default | Description |
|---|---|---|
| `CC_AGGREGATED_TRADES_MAX_MINUTES` | `60` | Window size for each fetch chunk |

**New types exported:**

```typescript
interface IAggregatedTradeData {
  id: string;
  price: number;
  qty: number;
  timestamp: number;
  isBuyerMaker: boolean;
}
```

**Schema integration** — add `getAggregatedTrades` to your exchange schema:

```typescript
addExchangeSchema({
  exchangeName: "binance",
  getAggregatedTrades: async (symbol, from, to, backtest) => {
    if (backtest) {
      return await db.getAggTrades(symbol, from, to);
    }
    return await binance.fetchAggTrades(symbol);
  },
});
```


## PineTS Indicator Inputs

`@backtest-kit/pinets` functions now accept an optional `inputs` parameter, allowing Pine Script indicator parameters to be passed directly from TypeScript without modifying the script source.

### `inputs` parameter in `run`, `getSignal`, `markdown`

```typescript
import { run, getSignal, markdown } from "@backtest-kit/pinets";

// Pass indicator inputs (e.g. RSI length override)
const result = await run(source, {
  symbol: "BTCUSDT",
  timeframe: "1h",
  limit: 200,
  inputs: { length: 14, source: "close" },
});

const signal = await getSignal(source, {
  symbol: "BTCUSDT",
  timeframe: "1h",
  limit: 200,
  inputs: { length: 14 },
});
```

When `inputs` is non-empty, the script is run through the new `IndicatorConnectionService` which wraps the Pine source in an `Indicator` class instance; otherwise execution falls through to the plain string code path unchanged.

### `useIndicator` — new function

```typescript
import { useIndicator } from "@backtest-kit/pinets";
import { Indicator } from "pinets";

// Override auto-detected Indicator class
useIndicator(Indicator);
```

**`IndicatorConnectionService`** auto-discovers the `Indicator` class from the `pinets` package via `require` then `import` fallback. Call `useIndicator` to bypass auto-discovery or when using a custom class.

**`TPineCtor`** updated from a plain function type to a constructor (`new (...) => IPine`) and `IPine.run` now accepts `string | IIndicator`.




# TypeScript Support for CLI (v3.4.0, 27/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.4.0)

## Native TypeScript Strategy Files

`@backtest-kit/cli` now runs `.ts` strategy files directly — no compilation step required. Pass your TypeScript file to the CLI just like any `.js` file.

### How it works

Under the hood, the CLI uses `@babel/standalone` with the `env` + `typescript` presets to transpile code on the fly into UMD format, then executes it in the current Node.js process. All `backtest-kit` and `@backtest-kit/*` packages are pre-registered as UMD globals, so imports resolve correctly without bundling.

The loader tries three strategies in order:
1. `require()` — for pre-compiled CJS files
2. `import()` — for native ESM files
3. **Babel transpile + eval** — for `.ts`, `.tsx`, and plain `.js` sources

This means existing workflows continue to work unchanged, and TypeScript becomes a first-class option.

### `--debug` flag

Pass `--debug` to write the transpiled output to `./debug.js` for inspection:

```bash
npx backtest-kit run strategy.ts --debug
```



# DCA / Average-Buy Support (v3.3.0, 26/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.3.0)

## 🪓 Dollar Cost Averaging (DCA) Engine

Full DCA support added across the entire stack: engine logic, report generation, Telegram notifications, CLI live module interface, and E2E tests.

### `commitAverageBuy` — new public function

```typescript
import { commitAverageBuy } from "backtest-kit";

const added = await commitAverageBuy("BTCUSDT");
// returns false if price moved in wrong direction (rejection, not error)
```

Context-aware public API function that works in both backtest and live modes. Automatically reads `currentPrice`, `exchangeName`, `frameName`, and `strategyName` from the active execution context. Delegates to `averageBuy()` on the strategy engine.

**Averaging rules:**
- **LONG** — new entry price must be **below** the last recorded entry (averaging down)
- **SHORT** — new entry price must be **above** the last recorded entry (averaging up)

Returns `false` (without throwing) when the price condition is not satisfied. Throws if called outside an execution context.

### `Backtest.commitAverageBuy` and `Live.commitAverageBuy`

Both static utility classes expose `commitAverageBuy(symbol, currentPrice, context)` for use outside strategy callbacks (e.g., test scripts or external automation).

### `StrategyCommitContract` — `AverageBuyCommit` added

New `AverageBuyCommit` variant in the discriminated union emitted on `strategyCommitSubject`:

```typescript
interface AverageBuyCommit extends SignalCommitBase {
  action: "average-buy";
  currentPrice: number;
  effectivePriceOpen: number;  // arithmetic mean of all _entry prices
  totalEntries: number;
  originalPriceOpen: number;
  // + full signal snapshot fields
}
```




# Analytics Dashboard (v3.2.0, 25/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.2.0)


## @backtest-kit/ui — Dashboard Page 📊

<img width="1920" height="1348" alt="image" src="https://github.com/user-attachments/assets/9a8e226e-99cc-4084-bbe3-a07b3102b5f6" />


New `/dashboard/:mode` page that gives a trader a complete, at-a-glance picture of strategy performance — without writing a single query or opening a spreadsheet. Supports two modes: **`live`** (real-time positions and account metrics) and **`backtest`** (historical simulation results). Switch between them from the dashboard's own toolbar.

The page aggregates data across **all registered symbols in parallel**, so multi-symbol strategies are covered automatically. A manual **Refresh** button clears the 45-second cache and forces a full reload. Signals can also be **exported to JSON** straight from the toolbar.

---

### Widget 1 — Revenue Cards (P&L Snapshot)

Four side-by-side cards, each showing accumulated profit/loss for a fixed time window: **Today**, **Yesterday**, **Last 7 days**, **Last 31 days**.

**What a trader reads instantly:**
- Is today green or red? The card background changes automatically — green for profit, red for loss, orange for flat.
- How does this week compare to last month? Two numbers, zero mental math.
- If a strategy degraded after a recent parameter tweak, the 7-day card turns red while the 31-day card is still green — a clear signal to investigate.

**Under the hood:** all P&L values are summed in the quote currency (USDT) across every symbol. Each card also shows the number of trades that contributed to the result, so a suspiciously large profit on one trade versus 50 small ones is immediately visible.

---

### Widget 2 — Trade Performance Gauge (SpeedDonut)

A half-circle gauge (speedometer style) that shows **total trades**, **profitable trades**, and **loss trades** as arc segments. A needle points to the current success ratio, and its color mirrors the segment it lands on — green for good, red for bad, orange in between.

**What a trader reads instantly:**
- Overall win rate at a glance — no numbers needed, the needle says it all.
- Whether the strategy is drifting toward more losses (needle creeps left over refresh cycles).
- If resolved and rejected counts are nearly equal, the orange zone triggers a review of entry conditions.

**Under the hood:** trades are classified as resolved (PnL > 0) or rejected (PnL ≤ 0). The arc segments are scaled proportionally to their max values, so the gauge stays readable regardless of total trade count.

---

### Widget 3 — Daily Trades Chart

A time-series line chart (powered by TradingView's `lightweight-charts`) showing **total trade count per day** over the full history of the dataset.

**What a trader reads instantly:**
- Activity spikes — days with unusually high trade counts often correlate with volatile market sessions or strategy misfires.
- Dead zones — stretches of zero trades may indicate missed opportunities or an overly restrictive filter.
- Trend direction — is the strategy becoming more or less active over time?

**On hover:** a tooltip shows the exact **Total / Resolved / Rejected** breakdown for that day, so a high-activity day with mostly red trades is immediately distinguishable from one with mostly green.

---

### Widget 4 — Success Rate Breakdown (per Symbol)

A scrollable list showing every symbol that has at least one completed trade, with four colored counters per row:

| Color | Meaning |
|-------|---------|
| 🟢 Green | Closed profitably **at Take Profit** price (TP hit within 0.5% tolerance) |
| 🔴 Red | Closed at a loss **at Stop Loss** price (SL hit within 0.5% tolerance) |
| 🔵 Blue | Closed profitably, but **not at TP** (early exit, manual close, partial fill) |
| 🟠 Orange | Closed at a loss, but **not at SL** (force-closed, liquidation, manual stop) |

**What a trader reads instantly:**
- Which symbols are generating clean TP hits versus messy exits — a high orange count means orders aren't reaching their targets.
- Whether stop losses are executing cleanly (high red) or getting overridden (high orange) — the difference matters for risk management.
- Which symbols to tune first: the one with 2 green and 40 orange gets attention before the one with 30 green and 5 red.

**Symbols are color-coded** with the same palette used across all other widgets, making cross-widget correlation trivial.

---

### Widget 5 — Signal Grid (Trade Log)

A paginated, infinite-scroll table of all individual signals, newest first. **Opened (pending) positions are pinned to the top** and highlighted in yellow so they stand out from completed trades.

**Columns per row:**
- Colored dot (symbol identifier)
- Symbol name
- Position direction: **LONG** (blue) or **SHORT** (orange)
- Entry price
- P&L % — green for profit, red for loss

**What a trader reads instantly:**
- Which positions are currently open and whether they are in profit or loss right now.
- The exact entry price and unrealized P&L for live positions (calculated in real time with slippage and fees).
- A quick scan of recent trades to spot patterns — e.g., all SHORT positions losing, all LONGs winning.

**Clicking any row** opens a detail panel with: symbol, position direction, open datetime, entry price, take profit, stop loss, and final P&L. No navigation away, no page reload.

**Unrealized P&L formula (live mode):** accounts for 0.1% slippage on entry and exit plus 0.1% maker/taker fee per leg. Partial closes are weighted correctly — a position closed 30% at one price and 70% at another is not averaged naively.

---

### Layout

The dashboard uses a responsive 12-column grid. On desktop all four P&L cards sit in a single row. The gauge, chart, success rate list, and signal grid each take half the screen width below. On tablet cards collapse to two per row; on mobile everything stacks to a single column. Heights scale to viewport so the key widgets are always fully visible without scrolling on a standard 1080p monitor.




# CLI Runner (v3.1.1, 24/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.1.1)

## @backtest-kit/cli 📟

New `@backtest-kit/cli` package — a zero-boilerplate command-line runner for backtest-kit strategies. Point it at your strategy entry point and run backtests, paper trading, or live bots without writing any infrastructure code.

**Execution Modes:**
- `--backtest` — runs strategy against historical candle data from a registered `FrameSchema`; auto-warms OHLCV cache for all required intervals before execution
- `--paper` — connects to live exchange prices but places no real orders; safe validation before going live
- `--live` — deploys a real trading bot with live order execution; requires exchange API keys in `.env`

**Optional Features:**
- `--ui` — launches `@backtest-kit/ui` web dashboard (configurable via `CC_WWWROOT_HOST` / `CC_WWWROOT_PORT`)
- `--telegram` — sends formatted HTML trade notifications with price charts via Telegram Bot API (requires `CC_TELEGRAM_TOKEN` / `CC_TELEGRAM_CHANNEL`)
- `--verbose` — logs each candle fetch with symbol, interval, and timestamp for cache debugging
- `--noCache` — skips automatic OHLCV cache warming for the backtest mode

**CLI Arguments:**

| Flag | Default | Description |
|------|---------|-------------|
| `--symbol` | `BTCUSDT` | Trading pair |
| `--strategy` | first registered | Strategy name |
| `--exchange` | first registered | Exchange name |
| `--frame` | first registered | Backtest frame name |
| `--cacheInterval` | `1m, 15m, 30m, 4h` | Comma-separated list of intervals to pre-cache |

**Mustache Notification Templates:**

All trade events have overridable templates: `opened`, `closed`, `scheduled`, `cancelled`, `risk`, `trailing-take`, `trailing-stop`, `breakeven`, `partial-profit`, `partial-loss`. Place custom `.mustache` files in `{strategy_dir}/template/` to override defaults.

**Live Module System:**

Optional `modules/live.module.mjs` lifecycle hooks called on every position event:

```javascript
export default class {
  onOpened(event) { ... }
  onClosed(event) { ... }
  onScheduled(event) { ... }
  onCancelled(event) { ... }
  onRisk(event) { ... }
  onPartialProfit(event) { ... }
  onPartialLoss(event) { ... }
  onTrailingTake(event) { ... }
  onTrailingStop(event) { ... }
  onBreakeven(event) { ... }
}
```

Supports both ES modules (`.mjs`) and CommonJS (`.cjs`) with automatic fallback.

**Monorepo Support:**

`ResolveService` changes the working directory to the strategy folder before execution and loads `.env` files in a cascade (root `.env` first, then strategy-specific overrides). All relative paths (`dump/`, `modules/`, `template/`) resolve within the strategy folder, providing complete per-strategy isolation.

**Get Started:**
```bash
npx -y @backtest-kit/cli --init
```

```json
{
  "scripts": {
    "backtest": "@backtest-kit/cli --backtest --symbol ETHUSDT --ui --telegram ./src/index.mjs",
    "paper":    "@backtest-kit/cli --paper ./src/index.mjs",
    "start":    "@backtest-kit/cli --live --ui ./src/index.mjs"
  }
}
```




# Frontend GUI & Pine Script Support (v3.0.0, 04/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.0.0)

# Frontend GUI Module 🖥️✨

New `@backtest-kit/ui` package delivers a full-stack UI framework for visualizing cryptocurrency trading signals, backtests, and real-time market data. Combines a Node.js backend server with a React dashboard - all in one package! 🚀

**Dashboard Views:**
- **Signal Opened** - Entry details with chart visualization
- **Signal Closed** - Exit details with PnL analysis
- **Signal Scheduled** - Pending orders awaiting activation
- **Signal Cancelled** - Cancelled orders with reasons
- **Risk Rejection** - Signals rejected by risk management
- **Partial Profit/Loss** - Partial position closures
- **Trailing Stop/Take** - Trailing adjustments visualization
- **Breakeven** - Breakeven level adjustments

Each view includes detailed information form, 1m/15m/1h candlestick charts, and JSON export.

```typescript
import { serve } from '@backtest-kit/ui';

// Start the UI server
serve('0.0.0.0', 60050);

// Dashboard available at http://localhost:60050
```

# Pine Script Language Support 📊🌲

New `@backtest-kit/pinets` package runs TradingView Pine Script strategies in Node.js! Execute your existing Pine Script indicators and generate trading signals - pure technical analysis with 1:1 syntax compatibility. Powered by [PineTS](https://github.com/QuantForgeOrg/PineTS). 🎯

**Features:**
- Pine Script v5/v6 with 1:1 TradingView compatibility
- 60+ indicators: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic, and more
- Load `.pine` files or pass code strings directly
- Full TypeScript support with generics for extracted data

**API Functions:**
| Function | Description |
|----------|-------------|
| `getSignal()` | Run Pine Script and get structured `ISignalDto` |
| `run()` | Run Pine Script and return raw plot data |
| `extract()` | Extract values from plots with custom mapping |
| `dumpPlotData()` | Dump plot data to markdown for debugging |
| `usePine()` | Register custom Pine constructor |
| `setLogger()` | Configure custom logger |
| `File.fromPath()` | Load Pine Script from `.pine` file |
| `Code.fromString()` | Use inline Pine Script code |

```typescript
import { File, getSignal } from '@backtest-kit/pinets';
import { addStrategy } from 'backtest-kit';

addStrategy({
  strategyName: 'pine-ema-cross',
  interval: '5m',
  riskName: 'demo',
  getSignal: async (symbol) => {
    const source = File.fromPath('strategy.pine');

    return await getSignal(source, {
      symbol,
      timeframe: '1h',
      limit: 100,
    });
  }
});
```

**Custom Plot Extraction:**

```typescript
import { File, run, extract } from '@backtest-kit/pinets';

const plots = await run(File.fromPath('indicators.pine'), {
  symbol: 'ETHUSDT',
  timeframe: '1h',
  limit: 200,
});

const data = await extract(plots, {
  rsi: 'RSI',
  macd: 'MACD',
  prevRsi: { plot: 'RSI', barsBack: 1 },
  trendStrength: { plot: 'ADX', transform: (v) => v > 25 ? 'strong' : 'weak' },
});
```

# Storage & Persistence Layer 💾

New unified storage API with pluggable adapters for signal data persistence:

```typescript
import { Storage, StorageLive, StorageBacktest } from "backtest-kit";

// Enable storage (subscribes to signal emitters)
const cleanup = Storage.enable();

// Find signal by ID (searches both backtest and live)
const signal = await Storage.findSignalById(signalId);

// List all signals by mode
const backtestSignals = await Storage.listSignalBacktest();
const liveSignals = await Storage.listSignalLive();

// Switch storage adapters
StorageBacktest.usePersist();  // File-based persistence
StorageBacktest.useMemory();   // In-memory (default for backtest)
StorageLive.useDummy();        // No-op storage
```





# API Refactoring (v2.0.3, 17/01/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/2.0.3)


**Breaking Changes - API Standardization** 🔧

Major API refactoring improves consistency, clarity, and reliability across the framework. Method names now better reflect their purpose and side effects, making code more maintainable and self-documenting.

**Core API Changes:**

1. **Backtest & Live Method Renaming** - All mutation methods now use `commit*` prefix to indicate state changes:
   - `cancel()` → `commitCancel()` - Cancel scheduled signals
   - `partialProfit()` → `commitPartialProfit()` - Close partial position at profit
   - `partialLoss()` → `commitPartialLoss()` - Close partial position at loss
   - `trailingStop()` → `commitTrailingStop()` - Adjust stop-loss trailing
   - `trailingTake()` → `commitTrailingTake()` - Adjust take-profit trailing
   - `breakeven()` → `commitBreakeven()` - Move stop-loss to entry price

2. **Action Handler Method Renaming** - Lifecycle methods use `*Available` suffix for milestone events:
   - `breakeven()` → `breakevenAvailable()` - Triggered when breakeven threshold reached
   - `partialProfit()` → `partialProfitAvailable()` - Triggered on profit milestones
   - `partialLoss()` → `partialLossAvailable()` - Triggered on loss milestones
   - `ping()` → split into `pingScheduled()` + `pingActive()` - Separate scheduled/active signal monitoring

3. **Enhanced Ping Events** - Better signal lifecycle tracking:
   - `pingScheduled()` - Called every minute while scheduled signal waits for activation
   - `pingActive()` - Called every minute while pending signal is active (position open)

**Improvements:**

4. **Ollama Timeout Protection** ⏱️ - All completion handlers now have 30-second inference timeout:
   - `runner.completion.ts` - Standard completion with timeout
   - `runner_outline.completion.ts` - Structured output completion with timeout
   - `runner_stream.completion.ts` - Streaming completion with timeout
   - Throws descriptive error on timeout instead of hanging indefinitely

5. **Exchange Data Deduplication** 🔍 - Candle data now filtered by timestamp:
   - Removes duplicate candles with identical timestamps
   - Logs warning when duplicates detected
   - Ensures data integrity for technical indicators

6. **Improved Method Name Consistency** - Internal method names aligned with public API:
   - `BACKTEST_METHOD_NAME_BREAKEVEN` constant added
   - All `METHOD_NAME_*` constants updated to reflect new naming

**Migration Guide:**

```typescript
// Before (v1.13.x)
await Backtest.cancel(symbol, context);
await Backtest.partialProfit(symbol, 30, price, context);
await Backtest.breakeven(symbol, price, context);

class MyAction extends ActionBase {
  async breakeven(event) { /* ... */ }
  async partialProfit(event) { /* ... */ }
  async ping(event) { /* ... */ }
}

// After (v1.14.0)
await Backtest.commitCancel(symbol, context);
await Backtest.commitPartiaAlProfit(symbol, 30, price, context);
await Backtest.commitBreakeven(symbol, price, context);

class MyAction extends ActionBase {
  async breakevenAvailable(event) { /* ... */ }
  async partialProfitAvailable(event) { /* ... */ }
  async pingScheduled(event) { /* scheduled signals */ }
  async pingActive(event) { /* active pending signals */ }
}
```

**Why These Changes:**

- **Clarity**: `commit*` prefix clearly indicates methods that modify state
- **Intent**: `*Available` suffix shows these are reactive event handlers, not commands
- **Consistency**: Unified naming convention across Backtest/Live classes
- **Separation**: Distinct ping handlers for different signal states improve event handling
- **Reliability**: Timeout protection prevents hanging on slow LLM inference




# 🎯 Event-Driven Trading Automation (v1.13.1, 16/01/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.13.1)

**Event-Driven Action Handlers** 🔔⚡

Revolutionary action system transforms backtest-kit into a true event bus for trading automation! The new `ActionBase` class provides extensible event handlers that react to all trading lifecycle events: signal state changes, breakeven milestones, partial profit/loss levels, scheduled signal monitoring, and risk rejections. Actions integrate seamlessly with state management (Redux-like, [state-reducer pattern](https://ivanmontiel.medium.com/discovering-the-state-reducer-pattern-3f324bb1a4c4)), real-time notifications (Telegram, Discord), logging systems, and analytics platforms. Each strategy can attach multiple actions with isolated context and guaranteed lifecycle management. 🚀✨

```typescript
import { ActionBase, addAction, addStrategy } from "backtest-kit";

// Create custom action handler by extending ActionBase
class TelegramNotifier extends ActionBase {
  private bot: TelegramBot | null = null;

  // Initialize resources (called once)
  async init() {
    super.init(); // Call parent for logging
    this.bot = new TelegramBot(process.env.TELEGRAM_TOKEN);
    await this.bot.connect();
    console.log(`Telegram notifier initialized for ${this.strategyName}`);
  }

  // Handle all signal events (backtest + live)
  async signal(event: IStrategyTickResult) {
    super.signal(event);
    if (event.action === 'opened') {
      await this.bot.send(
        `🚀 [${this.strategyName}/${this.frameName}] Signal opened!\n` +
        `Position: ${event.signal.position}\n` +
        `Entry: ${event.signal.priceOpen}\n` +
        `TP: ${event.signal.priceTakeProfit}\n` +
        `SL: ${event.signal.priceStopLoss}`
      );
    }
    if (event.action === 'closed') {
      const emoji = event.signal.revenue > 0 ? '✅' : '❌';
      await this.bot.send(
        `${emoji} Signal closed!\n` +
        `PNL: ${event.signal.revenue.toFixed(2)}%`
      );
    }
  }

  // Handle live-only events (production notifications)
  async signalLive(event: IStrategyTickResult) {
    super.signalLive(event);
    if (event.action === 'opened') {
      await this.bot.send('⚠️ REAL TRADE OPENED IN PRODUCTION!');
    }
  }

  // Handle breakeven milestone
  async breakeven(event: BreakevenContract) {
    super.breakeven(event);
    await this.bot.send(
      `🛡️ Breakeven protection activated!\n` +
      `Stop-loss moved to entry: ${event.data.priceOpen}`
    );
  }

  // Handle profit milestones (10%, 20%, 30%...)
  async partialProfit(event: PartialProfitContract) {
    super.partialProfit(event);
    await this.bot.send(
      `💰 Profit milestone reached: ${event.level}%\n` +
      `Current price: ${event.currentPrice}`
    );
  }

  // Handle loss milestones (-10%, -20%, -30%...)
  async partialLoss(event: PartialLossContract) {
    super.partialLoss(event);
    await this.bot.send(
      `⚠️ Loss milestone: -${event.level}%\n` +
      `Current price: ${event.currentPrice}`
    );
  }

  // Monitor scheduled signals (called every minute while waiting)
  async ping(event: PingContract) {
    const waitTime = Date.now() - event.data.timestampScheduled;
    const waitMinutes = Math.floor(waitTime / 60000);
    if (waitMinutes > 30) {
      await this.bot.send(
        `⏰ Scheduled signal waiting ${waitMinutes} minutes\n` +
        `Entry target: ${event.data.priceOpen}`
      );
    }
  }

  // Track risk rejections
  async riskRejection(event: RiskContract) {
    super.riskRejection(event);
    await this.bot.send(
      `🚫 Signal rejected by risk management!\n` +
      `Reason: ${event.rejectionNote}\n` +
      `Active positions: ${event.activePositionCount}`
    );
  }

  // Cleanup resources (called once on disposal)
  async dispose() {
    super.dispose();
    await this.bot?.disconnect();
    this.bot = null;
    console.log('Telegram notifier disposed');
  }
}

// Register the action
addAction({
  actionName: "telegram-notifier",
  handler: TelegramNotifier
});

// Attach to strategy
addStrategy({
  strategyName: "my-strategy",
  interval: "1m",
  actions: ["telegram-notifier"], // ← Attach action
  getSignal: async () => { /* ... */ }
});
```

**ActionBase Event Handler Methods** 📋

All methods have default implementations (only override what you need):

- **`init()`** - Called once after construction. Use for async setup: database connections, API clients, file handles.
- **`signal(event)`** - Called every tick/candle (all modes). Receives all signal states: idle, scheduled, opened, active, closed, cancelled.
- **`signalLive(event)`** - Called only in live mode. Use for production notifications and real order placement.
- **`signalBacktest(event)`** - Called only in backtest mode. Use for backtest metrics and test-specific logic.
- **`breakeven(event)`** - Called once when stop-loss moves to entry price (threshold: fees + slippage × 2).
- **`partialProfit(event)`** - Called at profit levels: 10%, 20%, 30%... Each level triggered exactly once per signal.
- **`partialLoss(event)`** - Called at loss levels: -10%, -20%, -30%... Each level triggered exactly once per signal.
- **`ping(event)`** - Called every minute while scheduled signal is waiting for activation.
- **`riskRejection(event)`** - Called when signal fails risk validation.
- **`dispose()`** - Called once on cleanup. Use to close connections, flush buffers, save state.

**Redux State Management Example** 🏗️

```typescript
import { ActionBase, addAction } from "backtest-kit";

class ReduxAction extends ActionBase {
  constructor(
    strategyName: StrategyName,
    frameName: FrameName,
    actionName: ActionName,
    private store: Store
  ) {
    super(strategyName, frameName, actionName);
  }

  signal(event: IStrategyTickResult) {
    this.store.dispatch({
      type: 'STRATEGY_SIGNAL',
      payload: {
        event,
        strategyName: this.strategyName,
        frameName: this.frameName,
        timestamp: Date.now()
      }
    });
  }

  breakeven(event: BreakevenContract) {
    this.store.dispatch({
      type: 'BREAKEVEN_REACHED',
      payload: { event, strategyName: this.strategyName }
    });
  }

  partialProfit(event: PartialProfitContract) {
    this.store.dispatch({
      type: 'PARTIAL_PROFIT',
      payload: { event, level: event.level }
    });
  }

  riskRejection(event: RiskContract) {
    this.store.dispatch({
      type: 'RISK_REJECTION',
      payload: { event, reason: event.rejectionNote }
    });
  }
}

// Register with dependency injection
addAction({
  actionName: "redux-store",
  handler: (strategyName, frameName, actionName) =>
    new ReduxAction(strategyName, frameName, actionName, store)
});
```

**Callback-Based Actions (No Class Required)** 🎯

```typescript
import { addAction } from "backtest-kit";

// Simple object-based action
addAction({
  actionName: "event-logger",
  handler: {
    init: () => {
      console.log('Logger initialized');
    },
    signal: (event) => {
      if (event.action === 'opened') {
        console.log('Signal opened:', event.signal.id);
      }
    },
    breakeven: (event) => {
      console.log('Breakeven at:', event.currentPrice);
    },
    dispose: () => {
      console.log('Logger disposed');
    }
  },
  callbacks: {
    onInit: (actionName, strategyName, frameName, backtest) => {
      console.log(`[${strategyName}/${frameName}] Logger started`);
    },
    onSignal: (event, actionName, strategyName, frameName, backtest) => {
      console.log(`[${strategyName}] Event: ${event.action}`);
    }
  }
});
```

**Multiple Actions Per Strategy** 🔗

```typescript
addStrategy({
  strategyName: "production-bot",
  interval: "5m",
  actions: [
    "telegram-notifier",  // Real-time notifications
    "redux-store",        // State management
    "event-logger",       // Logging
    "analytics-tracker"   // Metrics collection
  ],
  getSignal: async () => { /* ... */ }
});
```

**Action Context Awareness** 🎯

Every action receives full context via constructor:

```typescript
class MyAction extends ActionBase {
  constructor(
    public readonly strategyName: StrategyName,  // "my-strategy"
    public readonly frameName: FrameName,        // "1d-backtest"
    public readonly actionName: ActionName       // "my-action"
  ) {
    super(strategyName, frameName, actionName);
    console.log(`Action ${actionName} created for ${strategyName}/${frameName}`);
  }
}
```

**Architecture & Lifecycle** 🏗️

```
Registration Flow:
  addAction({ actionName, handler })
    → ActionValidationService (validates & registers)
    → ActionSchemaService (stores schema)

Execution Flow:
  Strategy.tick() or Backtest.run()
    → ActionCoreService.initFn()
      → For each action: ClientAction.waitForInit()
        → handler.init() [once]
    → On each tick/candle:
      → ActionCoreService.signal()
        → For each action: ClientAction.signal()
          → handler.signal() + callbacks
    → On breakeven threshold:
      → ActionCoreService.breakeven()
        → For each action: handler.breakeven()
    → On partial profit/loss levels:
      → ActionCoreService.partialProfit/Loss()
        → For each action: handler.partialProfit/Loss()
    → On scheduled signal ping:
      → ActionCoreService.ping()
        → For each action: handler.ping()
    → On risk rejection:
      → ActionCoreService.riskRejection()
        → For each action: handler.riskRejection()
    → On disposal:
      → ActionCoreService.dispose()
        → For each action: handler.dispose() [once]

Lifecycle Guarantees:
  - init() called exactly once (singleshot pattern)
  - dispose() called exactly once (singleshot pattern)
  - Events auto-initialize handler if needed (lazy loading)
  - Error isolation: one failing action doesn't break others
  - Memoization: one ClientAction instance per strategy-frame-action
```

**Service Architecture** 📦

- **ActionCoreService** - Global dispatcher routing actions to all handlers
- **ActionConnectionService** - Memoized ClientAction instance management
- **ActionValidationService** - Schema registry and validation
- **ActionSchemaService** - Action schema storage
- **ClientAction** - Lifecycle wrapper with lazy initialization and error handling

**Event Sources** 🔔

- **StrategyConnectionService** → signal, signalLive, signalBacktest, ping
- **BreakevenConnectionService** → breakeven
- **PartialConnectionService** → partialProfit, partialLoss
- **RiskConnectionService** → riskRejection




# 🤗 JSONL Event Logging (v1.11.2, 11/01/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.11.2)

**JSONL Event Logging for Analytics** 📊✨

> P.S. JSONL is the native format for Claude Code, HuggingFace, OpenAI and Llama. That means finally `backtest-kit` can be used as [Claude Code skill](https://code.claude.com/docs/en/skills)

New `Report` utility class provides structured event logging to JSONL (JSON Lines) files for post-processing analytics and data pipelines! All trading events (signals, partial closes, breakeven, risk rejections, etc.) can now be logged to append-only JSONL files with full metadata for filtering and search. Features pluggable storage adapters, automatic backpressure handling, and real-time event streaming. Perfect for building custom analytics dashboards, machine learning datasets, and audit trails. 🚀

```ts
import { Report } from "backtest-kit";

// Enable JSONL logging for all services
const unsubscribe = Report.enable({
  backtest: true,      // Log closed signals
  live: true,          // Log all tick events
  risk: true,          // Log risk rejections
  schedule: true,      // Log scheduled signals
  breakeven: true,     // Log breakeven events
  partial: true,       // Log partial closes
  heat: true,          // Log heatmap data
  walker: true,        // Log walker iterations
  performance: true,   // Log performance metrics
});

// Events are written to ./dump/report/{reportName}.jsonl
// Each line contains: { reportName, data, symbol, strategyName, exchangeName, frameName, signalId, timestamp }

// Disable logging when done
unsubscribe();

// Or switch to dummy adapter (no-op)
Report.useDummy();

// Switch back to JSONL
Report.useJsonl();
```

**Custom Report Storage Adapters** 🔌

Implement custom storage backends with the adapter pattern! Create your own `TReportBase` implementation to send events to databases, message queues, cloud storage, or any other destination. The system automatically handles initialization, memoization, and cleanup. 🏗️

```ts
import { Report, TReportBase, ReportName, IReportDumpOptions } from "backtest-kit";

class PostgresReportAdapter implements TReportBase {
  constructor(readonly reportName: ReportName, readonly baseDir: string) {
    // Connect to PostgreSQL
  }

  async waitForInit(initial: boolean): Promise<void> {
    // Initialize tables
  }

  async write<T = any>(data: T, options: IReportDumpOptions): Promise<void> {
    // INSERT INTO events (report_name, data, symbol, ...) VALUES (...)
  }
}

// Use custom adapter
Report.useReportAdapter(PostgresReportAdapter);
```

**Enhanced Markdown Reports with Column Definitions** 📝

New column definition system provides fine-grained control over markdown table structure! Configure which columns to display, how to format values, and conditional visibility rules. Pre-built column sets for backtest, live, risk, and schedule reports included. 🎨

```ts
import {
  backtest_columns,
  live_columns,
  risk_columns,
  schedule_columns
} from "backtest-kit";

// backtest_columns includes:
// - Signal ID, Symbol, Position, Note
// - Open/Close Price, TP/SL, Original TP/SL
// - PNL (net), Total Executed, Partial Closes
// - Close Reason, Duration, Timestamps

// live_columns includes:
// - Signal ID, Symbol, Position, Note
// - Current Price, TP/SL, Original TP/SL
// - PNL (net), Total Executed, Partial Closes
// - Progress to TP/SL, Active Duration, Timestamps

// risk_columns includes:
// - Symbol, Position, Rejection Reason
// - Price levels and validation errors

// schedule_columns includes:
// - Signal ID, Symbol, Position
// - Price Open, Current Price, TP/SL
// - Wait Time, Event Type, Timestamps
```

**Improved Markdown Service with Dual Adapters** 📂

The `Markdown` utility class now supports two storage strategies: file-based (single markdown file per symbol) and folder-based (one file per signal). Both adapters use the same event listening system and column definitions. Folder-based mode is perfect for large datasets with thousands of signals. 🗂️

```ts
import { Markdown, MarkdownFileBase, MarkdownFolderBase } from "backtest-kit";

// Enable markdown reports (default: file-based)
const unsubscribe = Markdown.enable({
  backtest: true,
  live: true,
  risk: true,
  // ... other services
});

// Switch to folder-based storage
Markdown.useMarkdownAdapter(MarkdownFolderBase);

// Switch back to file-based storage
Markdown.useMarkdownAdapter(MarkdownFileBase);

// Disable markdown generation (dummy adapter)
Markdown.useDummy();
```

**Active Position PNL Tracking** 💰

The `IStrategyTickResultActive` event now includes real-time PNL calculation for open positions! Track unrealized profit/loss with fees, slippage, and partial closes already applied. No need to calculate PNL manually - it's available on every tick. ⚡

```ts
import { listenSignal} from "backtest-kit";

listenSignal((event) => {
  console.log(`Active position PNL: ${event.pnl.pnlPercentage.toFixed(2)}%`);
  console.log(`Gross PNL: ${event.pnl.pnlGross.toFixed(2)}%`);
  console.log(`Fees: ${event.pnl.totalFee.toFixed(2)}%`);
  console.log(`Slippage: ${event.pnl.totalSlippage.toFixed(2)}%`);
});
```

**Total Executed Tracking** 📈

New `totalExecuted` field on signal data tracks the cumulative percentage closed through partial executions! Sums all partial close percentages (both profit and loss types) to show exactly how much of the position remains open. Range: 0-100%, where 0 means no partials and 100 means fully closed via partials. 🎯

```ts
import { listenSignalBacktest } from "backtest-kit";

listenSignalBacktest((event) => {
  if (event.action === "active") {
    console.log(`Total executed: ${event.signal.totalExecuted.toFixed(1)}%`);
    console.log(`Remaining: ${(100 - event.signal.totalExecuted).toFixed(1)}%`);

    // Access partial close history
    const partials = event.signal._partial;
    console.log(`Partial closes: ${partials.length}`);
    partials.forEach(p => {
      console.log(`  ${p.type}: ${p.percent}% at ${p.price}`);
    });
  }
});
```

**Improved Partial Close API** ✅

The `partialProfit()` and `partialLoss()` methods now return `boolean` instead of `void`! Returns `true` if partial close was executed, `false` if skipped (would exceed 100%). Provides clear feedback for validation and logging. No more silent failures! 🛡️

```ts
addStrategy({
  strategyName: "my-strategy",
  interval: "5m",
  getSignal: async () => { /* ... */ },
  callbacks: {
    onPartialProfit: async (symbol, signal, currentPrice, percentTp, backtest) => {
      if (percentTp >= 50) {
        const success = await strategy.partialProfit(symbol, 25, currentPrice, backtest);
        if (success) {
          console.log(`✅ Closed 25% at ${percentTp}% profit`);
        } else {
          console.log(`⚠️ Partial close skipped (would exceed 100%)`);
        }
      }
    },
  },
});
```



# Breakeven Protection (v1.10.1, 09/01/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.10.1)

**Breakeven Stop-Loss Protection** 🛡️📈

New breakeven protection automatically moves stop-loss to entry price when profit threshold is reached! When the price moves far enough in profit direction, the system locks in a zero-risk position by moving SL to breakeven. The threshold is calculated as `(CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2` to account for trading costs. Breakeven is triggered exactly once per signal with crash-safe persistence and memory-optimized instance management. ✨

```ts
import {
  listenBreakeven,
  Backtest,
  Live,
} from "backtest-kit";

// Listen to breakeven events
listenBreakeven(({ symbol, signal, currentPrice, backtest }) => {
  console.log(`${symbol} signal #${signal.id} moved to breakeven at ${currentPrice}`);
  console.log(`Entry: ${signal.priceOpen}, Position: ${signal.position}`);
});

// Manual breakeven trigger (optional)
await Backtest.breakeven("BTCUSDT", currentPrice, {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

await Live.breakeven("BTCUSDT", currentPrice, {
  strategyName: "my-strategy",
  exchangeName: "binance"
});
```

**Breakeven Statistics & Reports** 📊

```ts
import { Breakeven } from "backtest-kit";

// Get statistical data
const stats = await Breakeven.getData("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});
console.log(stats);
// {
//   totalBreakeven: 42,
//   eventList: [...]
// }

// Generate markdown report
const markdown = await Breakeven.getReport("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Save to disk
await Breakeven.dump("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
}); // ./dump/breakeven/BTCUSDT_my-strategy.md
```

**Architecture** 🏗️

- **BreakevenGlobalService**: Global service layer with validation and logging
- **BreakevenConnectionService**: Connection layer with memoized ClientBreakeven instances
- **ClientBreakeven**: Core breakeven logic with state persistence
- **PersistBreakevenUtils**: Crash-safe state persistence to disk
- **BreakevenMarkdownService**: Event accumulation and report generation

Features:
- One ClientBreakeven instance per signal ID (memoized for performance)
- Automatic cleanup on signal close to prevent memory leaks
- File-based persistence in `./dump/data/breakeven/{symbol}_{strategy}/state.json`
- Real-time event emission via breakevenSubject
- Markdown reports with complete breakeven history




# Enhanced Risk Management (v1.6.1, 28/12/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.6.1)


**Advanced Risk Reporting & Analysis** 📊🛡️

Comprehensive risk management system with detailed reporting and validation! The new `Risk` utility class provides extensive analytics for risk rejection tracking and exposure monitoring. Generate markdown reports with complete history of rejected signals, risk validations, and detailed statistics. Features include the `MergeRisk` composite pattern for combining multiple risk profiles with logical AND validation. ✨

```ts
import { Risk } from "backtest-kit";

// Get risk rejection statistics for a symbol
const stats = await Risk.getData("BTCUSDT", "my-strategy");

// Generate markdown risk report
const report = await Risk.getReport("BTCUSDT", "my-strategy");

// Save risk report to disk
await Risk.dump("BTCUSDT", "my-strategy"); // ./dump/risk/BTCUSDT_my-strategy.md
```

**Schedule Reporting Enhancements** 📅

Enhanced scheduled signal reporting with detailed statistics! Track cancellation rates, average wait times, and complete history of scheduled orders. The `Schedule` utility class provides access to all schedule events including pending, activated, and cancelled signals. 🎯

```ts
import { Schedule } from "backtest-kit";

// Get schedule statistics
const stats = await Schedule.getData("BTCUSDT", "my-strategy");
console.log(`Cancellation rate: ${stats.cancellationRate}%`);
console.log(`Average wait time: ${stats.avgWaitTime} minutes`);

// Generate markdown schedule report
const report = await Schedule.getReport("BTCUSDT", "my-strategy");

// Save to disk
await Schedule.dump("BTCUSDT", "my-strategy"); // ./dump/schedule/BTCUSDT_my-strategy.md
```

**Caching & Performance** ⚡💾

New `Cache` utility class provides intelligent memoization for expensive operations! Candle data, price calculations, and exchange queries are automatically cached with timeframe-based invalidation. Memory-optimized storage prevents duplicate API calls during backtest and live trading modes. Cache is integrated automatically - no manual configuration needed! 🚀

```ts
import { Cache } from "backtest-kit";

const fetchMicroTermMath = Cache.fn(lib.microTermMathService.getReport, {
  interval: "1m",
});

const commitMicroTermMath = trycatch(
  async (symbol: string, history: History) => {
    const microTermMath = await fetchMicroTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== HISTORICAL 1-MINUTE CANDLE DATA ===",
          "",
          microTermMath
        ),
      },
      {
        role: "assistant",
        content: "Historical 1-minute candle data has been received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchMicroTermMath),
  }
);
```

**Exchange Utilities** 🔧

New `Exchange` utility class provides helper functions for exchange-specific operations! The `ExchangeInstance` class offers methods for formatting prices and quantities according to exchange precision rules, integrated seamlessly with CCXT. 📈

```ts
import { Exchange } from "backtest-kit";

// Get exchange instance for specific exchange
const binance = Exchange.get("binance");

// Format price with exchange precision
const formattedPrice = await binance.formatPrice("BTCUSDT", 43521.123456);

// Format quantity with exchange precision
const formattedQty = await binance.formatQuantity("BTCUSDT", 0.123456789);
```

**LLM-Powered Signal Cancellation** 🤖🚫

New `listenPing` event enables dynamic signal cancellation based on LLM analysis! Monitor scheduled signals in real-time and cancel them if market conditions change. Perfect for avoiding Second-Order Chaos when thousands of bots trigger the same levels. Integrate with Ollama or OpenAI to analyze market context every minute and cancel signals before they activate. 🎯

```ts
import {
  listenPing,
  Backtest,
  getAveragePrice
} from "backtest-kit";
import { json } from "agent-swarm-kit";

// Listen to ping events for scheduled signals
listenPing(async (event) => {
  if (event.backtest) {
    console.log(`[Backtest] Monitoring ${event.symbol} signal #${event.data.id}`);
    console.log(`Strategy: ${event.strategyName}, Price: ${event.data.priceOpen}`);

    // Get current market conditions
    const currentPrice = await getAveragePrice(event.symbol);

    // Ask LLM to re-evaluate signal validity
    const { data, error } = await json("SignalReview", {
      symbol: event.symbol,
      signalId: event.data.id,
      position: event.data.position,
      priceOpen: event.data.priceOpen,
      currentPrice,
      timestamp: event.timestamp,
    });

    if (error) {
      console.error("LLM validation error:", error);
      return;
    }

    // Cancel signal if LLM detects bot cluster trap
    if (data.recommendation === "cancel") {
      console.log(`🚫 LLM detected trap: ${data.reasoning}`);
      console.log(`Cancelling signal #${event.data.id}...`);

      await Backtest.cancel(
        event.symbol,
        event.strategyName
      );

      console.log(`✅ Signal #${event.data.id} cancelled`);
    }
  }
});
```




# Partial Profit/Loss Tracking (v1.4.0, 03/12/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.4.0)

**Position Scaling with Fixed Levels** 📊💰

Now you can scale out positions at fixed profit/loss milestones (10%, 20%, 30%, ..., 100%)! The system automatically monitors signals and emits events when they reach specific percentage levels, enabling sophisticated risk management strategies like partial profit taking and dynamic stop-loss adjustments. Each level is triggered **exactly once per signal** with Set-based deduplication and crash-safe persistence. 🎯✨

```ts
import {
  listenPartialProfit,
  listenPartialLoss,
  Constant
} from "backtest-kit";

// Listen to all profit levels (10%, 20%, 30%, ...)
listenPartialProfit(({ symbol, signal, price, level, backtest }) => {
  console.log(`${symbol} reached ${level}% profit at ${price}`);

  // Scale out at Kelly-optimized levels
  if (level === Constant.TP_LEVEL3) {
    console.log("Close 33% at 25% profit");
  }
  if (level === Constant.TP_LEVEL2) {
    console.log("Close 33% at 50% profit");
  }
  if (level === Constant.TP_LEVEL1) {
    console.log("Close 34% at 100% profit");
  }
});

// Listen to all loss levels (10%, 20%, 30%, ...)
listenPartialLoss(({ symbol, signal, price, level, backtest }) => {
  console.log(`${symbol} reached -${level}% loss at ${price}`);

  // Scale out at stop levels
  if (level === Constant.SL_LEVEL2) {
    console.log("Close 50% at -50% loss");
  }
  if (level === Constant.SL_LEVEL1) {
    console.log("Close 50% at -100% loss");
  }
});
```

**New Event Listeners** 🎧

- **`listenPartialProfit(callback)`** - Emits for each profit level reached (10%, 20%, 30%, etc.)
- **`listenPartialLoss(callback)`** - Emits for each loss level reached (10%, 20%, 30%, etc.)
- **`listenPartialProfitOnce(filter, callback)`** - Fires once for first profit level
- **`listenPartialLossOnce(filter, callback)`** - Fires once for first loss level

**Constant Utility** 📐

Kelly Criterion-based constants for optimal position sizing:

```ts
import { Constant } from "backtest-kit";

// Take Profit Levels
Constant.TP_LEVEL1  // 100% (aggressive target)
Constant.TP_LEVEL2  // 50%  (moderate target)
Constant.TP_LEVEL3  // 25%  (conservative target)

// Stop Loss Levels
Constant.SL_LEVEL1  // 100% (maximum risk)
Constant.SL_LEVEL2  // 50%  (standard stop)
```

**Partial Statistics & Reports** 📈

```ts
import { Partial } from "backtest-kit";

// Get statistical data
const stats = await Partial.getData("BTCUSDT");
console.log(stats);
// {
//   totalEvents: 15,
//   totalProfit: 10,
//   totalLoss: 5,
//   eventList: [...]
// }

// Generate markdown report
const markdown = await Partial.getReport("BTCUSDT");

// Save to disk
await Partial.dump("BTCUSDT"); // ./dump/partial/BTCUSDT.md
```

**Strategy-Level Callbacks** 🎯

```ts
addStrategy({
  strategyName: "my-strategy",
  interval: "5m",
  getSignal: async (symbol) => { /* ... */ },
  callbacks: {
    onPartialProfit: (symbol, data, currentPrice, revenuePercent, backtest) => {
      console.log(`Signal ${data.id} at ${revenuePercent.toFixed(2)}% profit`);
    },
    onPartialLoss: (symbol, data, currentPrice, lossPercent, backtest) => {
      console.log(`Signal ${data.id} at ${lossPercent.toFixed(2)}% loss`);
    },
  },
});
```




# Immediate Activation (v1.3.0, 01/12/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.3.0)

**Smart Signal Activation** 🚀⚡

Now signals activate **immediately** when `priceOpen` is already in the activation zone — no more waiting for scheduled state when the price has already moved! LONG positions open instantly when current price (VWAP) is below `priceOpen`, and SHORT positions trigger immediately when price is above `priceOpen`. Enhanced validation prevents invalid signals from being created: immediate signals are rejected if current price has already breached StopLoss or TakeProfit levels. Strict boundary checks (`<`/`>` instead of `<=`/`>=`) allow signals when price exactly equals SL/TP boundaries. 🎯✨

```ts
// Example: Immediate LONG activation
{
  position: "long",
  priceOpen: 43000,      // Target entry price
  priceStopLoss: 41000,
  priceTakeProfit: 44000
}

// Current market conditions:
currentPrice (VWAP) = 42000  // Already below priceOpen!

// Before v1.3.0:
→ scheduled → waiting for price to fall to 43000

// After v1.3.0:
→ opened IMMEDIATELY (price already at desired level!)
```

**Validation Enhancements** 🛡️

- **Mandatory `isScheduled` parameter**: Validation now distinguishes between scheduled and immediate signals
- **Immediate signal protection**: Rejects signals if `currentPrice < priceStopLoss` for LONG or `currentPrice > priceStopLoss` for SHORT
- **Boundary-safe validation**: Changed from `<=`/`>=` to `<`/`>` to allow signals when price exactly equals SL/TP
- **No false rejections**: Signals can now be created when current price equals stop-loss or take-profit boundaries

**Breaking Changes** ⚠️

- `VALIDATE_SIGNAL_FN` now requires explicit `isScheduled: boolean` parameter (no default value)
- Test expectations updated to account for immediate activation behavior
- Scheduled signal counts may differ due to immediate activation in certain price conditions

See [test/README.md](./test/README.md) for comprehensive documentation on immediate activation patterns and updated test writing guidelines.




# Scheduled (Limit) Orders (v1.2.1, 29/11/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.2.1)

**Scheduled Positions with SL Protection** 🚀✨

Now LONG orders activate only when the candle’s low touches or breaks below `priceOpen`, while SHORT orders trigger when the high reaches or exceeds `priceOpen`. Most importantly — StopLoss is checked first on every candle: if a single candle hits both `priceOpen` and `priceStopLoss` at the same time, the signal is instantly cancelled and the position is never opened, protecting you from instant losses even in the wildest volatility spikes. 🛡️⚡ All edge cases are thoroughly tested and documented.

```ts
// Example: LONG scheduled position
{
  position: "long",
  priceOpen: 42000,
  priceStopLoss: 41000,
  priceTakeProfit: 45000
}

// Candle that would previously cause trouble:
{ low: 40500, high: 43000 }  // ← hits both levels!

→ Result: instantly CANCELLED (position never opens)
```




# Backtest & Live Trading (v1.1.1, 22/11/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.1.1)

Build robust trading systems with crash-safe state persistence and event-driven architecture! 🚀 Test strategies on historical data or deploy to production with automatic recovery. 💾 Type-safe signal lifecycle prevents invalid trades with comprehensive validation. ✅ Memory-optimized async generators stream execution for backtest and live modes. 🔄 Event emitters provide real-time notifications for signals, errors, and completion. 🔔 Generate markdown reports with win rate and PNL statistics automatically. 📊

```typescript
import {
  addExchange,
  addStrategy,
  addFrame,
  Backtest,
  Live,
  listenSignalBacktest,
  listenSignalLive,
  listenError,
  listenDone,
} from "backtest-kit";

// Register exchange with CCXT
addExchange({
  exchangeName: "binance",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
  formatPrice: async (symbol, price) => {
    const exchange = new ccxt.binance();
    return exchange.priceToPrecision(symbol, price);
  },
  formatQuantity: async (symbol, quantity) => {
    const exchange = new ccxt.binance();
    return exchange.amountToPrecision(symbol, quantity);
  },
});

// Register strategy
addStrategy({
  strategyName: "my-strategy",
  interval: "1m",
  getSignal: async ({ getCandles, getAveragePrice }) => {
    const candles = await getCandles("BTCUSDT", "1h", 100);
    const currentPrice = await getAveragePrice("BTCUSDT");

    // Your strategy logic here
    return {
      position: "long",
      note: "BTC breakout",
      priceOpen: currentPrice,
      priceTakeProfit: currentPrice * 1.02,
      priceStopLoss: currentPrice * 0.98,
      minuteEstimatedTime: 60,
      timestamp: Date.now(),
    };
  },
});

// Register timeframe for backtest
addFrame({
  frameName: "1d-backtest",
  interval: "1m",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-02T00:00:00Z"),
});

// Run backtest in background
Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Listen to signals
listenSignalBacktest((event) => {
  if (event.action === "closed") {
    console.log("PNL:", event.pnl.pnlPercentage);
  }
});

// Listen to completion
listenDone((event) => {
  if (event.backtest) {
    console.log("Backtest completed:", event.symbol);
    Backtest.dump(event.strategyName); // ./logs/backtest/my-strategy.md
  }
});

// Listen to errors
listenError((error) => {
  console.error("Error:", error.message);
});
```



