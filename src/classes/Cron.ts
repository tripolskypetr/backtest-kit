import { compose, errorData, getErrorMessage, singlerun, singleshot } from "functools-kit";
import LoggerService from "../lib/services/base/LoggerService";
import RuntimeMetaService from "../lib/services/meta/RuntimeMetaService";
import { CandleInterval } from "../interfaces/Exchange.interface";
import {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { alignToInterval } from "../utils/alignToInterval";
import {
  beforeStartSubject,
  idlePingSubject,
  activePingSubject,
  schedulePingSubject,
  errorEmitter,
} from "../config/emitters";
import { BeforeStartContract } from "../contract/BeforeStart.contract";
import IdlePingContract from "../contract/IdlePing.contract";
import ActivePingContract from "../contract/ActivePing.contract";
import SchedulePingContract from "../contract/SchedulePing.contract";
import { IRuntimeInfo } from "../interfaces/Runtime.interface";

const CRON_METHOD_NAME_REGISTER = "CronUtils.register";
const CRON_METHOD_NAME_UNREGISTER = "CronUtils.unregister";
const CRON_METHOD_NAME_CLEAR = "CronUtils.clear";
const CRON_METHOD_NAME_TICK = "CronUtils._tick";
const CRON_METHOD_NAME_ENABLE = "CronUtils.enable";
const CRON_METHOD_NAME_DISABLE = "CronUtils.disable";
const CRON_METHOD_NAME_DISPOSE = "CronUtils.dispose";

/**
 * Watchdog timeout (ms) for a single cron handler invocation.
 *
 * A slot that does not settle within this window is treated as failed:
 * `_runEntry` races the runtime-info assembly plus `entry.handler(info)`
 * against a timer of this duration and, when the timer wins, rejects into the
 * same `catch` as any other handler error — surfacing `failed = true`, logging
 * a warning, and (for periodic entries) rolling back the watermark so the
 * boundary is retried on the next tick.
 *
 * This guards the `singlerun`-serialised tick pipeline against a handler that
 * never resolves (a lost `resolve`, a hung network call with no timeout of its
 * own): without it such a handler would hold its `_inFlight` slot forever and
 * `_tick`'s `Promise.all` would never settle, silently stalling every
 * subsequent lifecycle tick while the process stays alive and outwardly
 * healthy.
 */
const CRON_HANDLER_TIMEOUT = 900_000;

/**
 * Early-warning threshold (ms) for a single cron handler invocation.
 *
 * Purely observational: when a slot is still running this long after it was
 * opened, `_runEntry` logs a warning naming the entry — so a slow handler is
 * visible in the logs long before the {@link CRON_HANDLER_TIMEOUT} watchdog
 * forcibly fails it. Nothing is interrupted and no rollback happens at this
 * mark; the slot keeps running and may still succeed.
 */
const CRON_HANDLER_WARN_TIMEOUT = 120_000;

/**
 * Local logger instance.
 *
 * Created directly rather than resolved from the DI container so that
 * `CronUtils` has no compile-time dependency on the rest of the framework
 * being bootstrapped — `Cron` can be imported and used in isolation.
 */
const LOGGER_SERVICE = new LoggerService();

/**
 * Local runtime-meta-service instance.
 *
 * Like {@link LOGGER_SERVICE}, instantiated directly via `new` rather than
 * resolved from the DI container so `CronUtils` carries no compile-time
 * dependency on a bootstrapped framework. `RuntimeMetaService` is built with
 * the `singleton` HOF from `di-singleton`, so `new RuntimeMetaService()`
 * returns the one shared singleton proxy — the same instance the rest of the
 * framework injects — and resolves its own dependencies lazily on first use.
 *
 * Used by {@link CronUtils._runEntry} to assemble the {@link IRuntimeInfo}
 * snapshot handed to each cron handler.
 */
const RUNTIME_META_SERVICE = new RuntimeMetaService();

/**
 * Callback signature for a cron entry handler.
 *
 * Receives a single {@link IRuntimeInfo} snapshot assembled by
 * `RuntimeMetaService.getRuntimeInfo` at the moment the entry fires. It bundles
 * everything a handler typically needs — symbol, execution context, current
 * price, backtest range and the strategy-defined `info` payload — so the
 * handler does not have to re-query the meta-services itself.
 *
 * Invocation cardinality depends on `entry.symbols` (see {@link CronEntry}):
 * - **Global mode** (`symbols` empty/undefined): invoked once per aligned
 *   boundary across all parallel backtests. The first symbol to reach the
 *   boundary opens the slot and runs the handler; others await the same
 *   promise.
 * - **Fan-out mode** (`symbols` non-empty): invoked once per aligned
 *   boundary **per whitelisted symbol**. Each symbol has its own slot.
 *
 * Key fields of the {@link IRuntimeInfo} argument:
 * - `info.symbol` — In global mode: the symbol of the backtest that first
 *   reached the boundary (the singleshot "winner"). In fan-out mode: the
 *   whitelisted symbol whose tick produced this invocation.
 * - `info.context` — `{ strategyName, exchangeName, frameName }` taken from
 *   the originating lifecycle event (`beforeStart` / `idlePing` / `activePing`
 *   / `schedulePing`, wired by {@link CronUtils.enable}).
 * - `info.backtest` — Execution-mode flag from the same event. `true` for
 *   backtest runs, `false` for live. The value reflects the **opening** tick
 *   that won the singleshot for this slot — all parallel awaiters of the same
 *   slot observe the same value, even if a later concurrent tick carried a
 *   different one.
 * - `info.range` — Backtest frame range (`from`/`to`), or `null` in live mode.
 * - `info.currentPrice` — Current market price at snapshot time.
 * - `info.info` — Strategy-defined runtime payload (`IStrategySchema.info`),
 *   or `null` when the strategy declares none.
 * - `info.when` — Snapshot time. **Note:** this is the execution-context tick
 *   time captured by `getRuntimeInfo`, not the cron-aligned boundary. The
 *   aligned boundary still governs *when* the entry fires (and is used for the
 *   slot/dedup keys); `info.when` is the wall/virtual time of the underlying
 *   tick that opened the slot.
 */
export type CronCallback = (
  info: IRuntimeInfo
) => void | Promise<void>;

/**
 * Configuration for a registered cron entry.
 */
export interface CronEntry {
  /**
   * Unique name of the entry. Used as the dedup key on `register` (re-registering
   * the same name replaces the previous entry) and as part of the singleshot
   * coordination key.
   *
   * Must be non-empty and must not contain `:` — `:` is reserved as the slot-key
   * segment separator and would otherwise create ambiguity between global and
   * fan-out fire-once keys.
   */
  name: string;
  /**
   * Candle interval at whose boundaries the handler fires.
   * Same scale as {@link CandleInterval} used by `Interval` and `Cache`:
   * `"1m" | "5m" | "1h" | "1d"` etc.
   *
   * If omitted, the entry switches to **fire-once** mode: the handler is
   * invoked on the very first matching tick (no boundary check) and never
   * again. If the handler throws, the entry is **not** marked as fired and
   * will retry on the next tick.
   */
  interval?: CandleInterval;
  /**
   * Symbol whitelist that doubles as the fan-out switch.
   *
   * - **Empty/undefined → global singleshot**: across all parallel backtests
   *   the handler runs **once** per boundary. The first symbol to reach the
   *   boundary opens the slot; others await the same promise.
   * - **Non-empty → per-symbol fan-out**: ticks whose `symbol` is not in the
   *   list are skipped, and ticks whose `symbol` *is* in the list each open
   *   their own slot. The handler runs **once per whitelisted symbol** per
   *   boundary.
   *
   * The same rule applies in fire-once mode: global → handler runs once
   * total; fan-out → once per whitelisted symbol.
   *
   * Each symbol must not contain `:` (same reason as {@link CronEntry.name}).
   */
  symbols?: string[];
  /** Handler invoked on the first parallel tick to reach a new boundary. */
  handler: CronCallback;
}

/**
 * Handle returned from `register`. Call it to unregister the entry —
 * equivalent to `Cron.unregister(name)`.
 *
 * @example
 * ```typescript
 * const dispose = Cron.register({
 *   name: "x",
 *   interval: "1h",
 *   handler: async (info) => { ... },
 * });
 * dispose(); // unregisters
 * ```
 */
export interface CronHandle {
  (): void;
}

/**
 * Internal record stored in `CronUtils._entries` per registered name.
 *
 * Wraps the user-supplied {@link CronEntry} with a monotonically increasing
 * `generation` counter that is bumped on every `register(entry)` call for
 * the same name. The generation participates in `firedKey`/`slotKey` so
 * late writes from a still-in-flight handler of a previous incarnation can
 * never collide with — or block — the new entry.
 *
 * Not exported — `CronUtils` is the only owner.
 */
interface ICronEntryRecord {
  /** The user-supplied entry configuration as passed to `register`. */
  entry: CronEntry;
  /**
   * Monotonic incarnation counter for this entry name. Re-registering the
   * same name yields a new record with `generation = previous + 1`.
   */
  generation: number;
}

/**
 * Bookkeeping for a periodic slot that a single `_tick` invocation actually
 * **opened** (the `!pending` branch of {@link CronUtils._tick}) and may need to
 * roll back.
 *
 * Only opened periodic slots are tracked: slots whose in-flight promise was
 * reused from another tick are excluded (rolling back a watermark this tick did
 * not advance would corrupt a sibling symbol's slot in global mode), and so are
 * fire-once slots (they coordinate via `_firedOnce`, not the watermark).
 *
 * After `await Promise.all`, `_tick` walks these records and, for any whose
 * `pending` resolved to `failed = true`, restores `_lastBoundary[boundaryKey]`
 * to `prevBoundary` (or deletes the key when `prevBoundary` is `undefined`),
 * re-arming the strict-`>` gate so the failed boundary is retried on the next
 * tick.
 *
 * Not exported — used only inside {@link CronUtils._tick}.
 */
interface ICronOpenedSlot {
  /**
   * The `_lastBoundary` key for this slot (`${name}${scope}${genSuffix}`, no
   * `alignedMs` segment) — the watermark entry to restore on failure.
   */
  boundaryKey: string;
  /**
   * The watermark value captured **before** this tick advanced it. `undefined`
   * means the boundary had never been opened, so a rollback deletes the key
   * rather than restoring a value.
   */
  prevBoundary: number | undefined;
  /**
   * The shared in-flight handler promise opened for this slot. Resolves to the
   * `failed` flag that decides whether the rollback fires.
   */
  pending: Promise<boolean>;
}


/**
 * Utility class for registering periodic tasks that fire on candle-interval
 * boundaries of the virtual time produced by parallel backtests.
 *
 * Exported as singleton instance `Cron` for convenient usage.
 *
 * Key property — **singleshot coordination across parallel backtests**:
 * when several `Backtest.background(symbol, ...)` runs hit the same aligned
 * boundary concurrently, the handler is invoked exactly once. Every parallel
 * `tick` for that boundary awaits the same in-flight promise and is released
 * together when the promise settles. After settlement the slot is cleared and
 * the next boundary produces a fresh promise.
 *
 * Typical wiring:
 *
 * @example
 * ```typescript
 * import { Cron, Backtest } from "backtest-kit";
 *
 * Cron.register({
 *   name: "tg-signal-parser",
 *   interval: "1h",
 *   handler: async (info) => {
 *     await parseTelegramSignalsToMongo(info.when);
 *   },
 * });
 *
 * // Subscribe Cron to the engine's lifecycle subjects (beforeStart,
 * // idlePing, activePing, schedulePing) once at startup. After this every
 * // strategy tick is forwarded into Cron automatically.
 * Cron.enable();
 *
 * for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "TRXUSDT"]) {
 *   Backtest.background(symbol, { strategyName, exchangeName, frameName });
 * }
 *
 * // On shutdown:
 * // Cron.disable();
 * ```
 */
export class CronUtils {
  /**
   * Registered entries by `name`.
   *
   * Each record carries a monotonically increasing `generation` counter that
   * is bumped on every `register(entry)` call for the same name. The
   * generation participates in `firedKey` so writes from a still-in-flight
   * handler of a previous incarnation cannot poison `_firedOnce` for the
   * current incarnation — their key has a different generation suffix and
   * is simply ignored on lookup.
   */
  private readonly _entries = new Map<string, ICronEntryRecord>();

  /** Monotonic counter used to mint new entry generations on `register`. */
  private _generationCounter = 0;

  /**
   * In-flight handler slots.
   *
   * Slot key shape (always includes the generation suffix `:g${generation}`;
   * the `:${symbol}` scope is present only in fan-out mode):
   * - Periodic global: `${name}:${alignedMs}:g${generation}`.
   * - Periodic fan-out: `${name}:${alignedMs}:${symbol}:g${generation}`.
   * - Fire-once global: `${name}:once:g${generation}`.
   * - Fire-once fan-out: `${name}:once:${symbol}:g${generation}`.
   *
   * Value is the shared in-flight handler promise. It resolves to a `boolean`
   * "failed" flag (`true` when the handler — or the runtime-info assembly —
   * threw), which `_tick` uses to roll back the periodic watermark of the slot
   * it opened so a failed boundary is retried. Every parallel `tick` for the
   * same slot key awaits this exact promise (mutex semantics) and is released
   * together when it settles. `_inFlight` is owned exclusively by `_runEntry` —
   * `clear()` does **not** touch it, so the singleshot promise survives
   * concurrent `clear` calls and continues to coordinate parallel ticks until
   * it settles.
   */
  private readonly _inFlight = new Map<string, Promise<boolean>>();

  /**
   * Keys of fire-once entries whose handler has already settled successfully.
   *
   * Key shape (always includes the entry generation suffix `:g${generation}`):
   * - Global fire-once: `${name}:g${generation}`.
   * - Fan-out fire-once: `${name}:${symbol}:g${generation}` — one entry per
   *   whitelisted symbol.
   *
   * The generation suffix isolates incarnations of the same `name`: writes
   * landing from a still-in-flight handler of a previous `register()` carry
   * the old generation and are never matched by the new entry's lookup.
   * Stale entries are pruned by `_clearFiredOnceFor` on `register`/`unregister`
   * and wiped by `clear()`.
   *
   * Looked up by `_tick` to decide whether to skip; written by `_runEntry`
   * on successful settle.
   */
  private readonly _firedOnce = new Set<string>();

  /**
   * Last interval boundary already fired per periodic slot.
   *
   * Key shape (no `alignedMs` segment — one entry per logical slot, not per
   * boundary; always carries the generation suffix `:g${generation}`, and the
   * `:${symbol}` scope only in fan-out mode):
   * - Periodic global: `${name}${genSuffix}`.
   * - Periodic fan-out: `${name}:${symbol}${genSuffix}`.
   *
   * Value is the aligned-boundary epoch ms (`alignedMs`) most recently opened
   * for that slot. `_tick` fires a periodic entry whenever the incoming tick's
   * aligned boundary is **strictly greater** than the stored value, instead of
   * requiring the tick to land *exactly* on the boundary. This fixes the
   * dropped-boundary bug: when virtual time jumps over a boundary (e.g. a
   * `5m`-driven loop skipping from 00:14 to 00:29 never lands on the `15m`
   * 00:15 boundary), the old `ts === alignedMs` check silently lost the tick.
   * With the watermark, the next tick whose `alignedMs` advanced past the
   * stored value fires once for the newest crossed boundary (catch-up
   * collapses multiple skipped boundaries into a single invocation at the
   * latest one).
   *
   * Written synchronously in `_tick` at slot-open time (before the `await`),
   * so a still-in-flight handler does not let a later tick re-open the same
   * (or an already-passed) boundary. If that handler then **fails**, the
   * advance is rolled back after the slot settles — the prior value is restored
   * (or the key deleted if there was none) — so the failed boundary is retried
   * on the next tick, mirroring catch-up of a skipped boundary. Fire-once
   * entries never touch this map — they use `_firedOnce`. Pruned by
   * `_clearBoundaryFor` on `register`/`unregister` and wiped by `dispose`.
   */
  private readonly _lastBoundary = new Map<string, number>();

  /**
   * Garbage-collect every `_lastBoundary` key that belongs to the entry `name`
   * (any generation, global or fan-out).
   *
   * Called from `register`/`unregister` alongside `_clearFiredOnceFor`. Like
   * that helper this is memory hygiene, not correctness — the generation suffix
   * already isolates re-registrations, so a stale watermark from an old
   * generation can never gate a new entry.
   */
  private _clearBoundaryFor(name: string): void {
    if (!name) {
      return;
    }
    const prefix = `${name}:`;
    for (const key of this._lastBoundary.keys()) {
      if (key === name || key.startsWith(prefix)) {
        this._lastBoundary.delete(key);
      }
    }
  }

  /**
   * Garbage-collect every `_firedOnce` key that belongs to the entry `name`
   * (any generation, global or fan-out).
   *
   * Called from `register`/`unregister` to free memory; **not** required
   * for correctness — the generation suffix already isolates re-registrations,
   * so leftover keys from old generations can never block a new entry.
   * They just sit unused until they are GC'd here or wiped by `clear()`.
   */
  private _clearFiredOnceFor(name: string): void {
    if (!name) {
      return;
    }
    const prefix = `${name}:`;
    for (const key of this._firedOnce) {
      if (key === name || key.startsWith(prefix)) {
        this._firedOnce.delete(key);
      }
    }
  }

  /**
   * Build the singleshot promise for a single in-flight slot.
   *
   * Assembles the {@link IRuntimeInfo} snapshot via
   * `RuntimeMetaService.getRuntimeInfo(symbol, context, backtest)` and invokes
   * `entry.handler(info)`, racing both against the
   * {@link CRON_HANDLER_TIMEOUT} watchdog — a slot that does not settle in time
   * rejects into the same `catch` as any other error, so a hung handler (or a
   * hung price fetch inside `getRuntimeInfo`) can never hold the `_inFlight`
   * slot forever and stall the serialised tick pipeline. A slot still running
   * at {@link CRON_HANDLER_WARN_TIMEOUT} logs an observational warning first,
   * so a slow handler is visible in the logs well before the watchdog forcibly
   * fails it. Logs any error via
   * `console.error` and **returns** a `failed` boolean (`true` when the
   * handler — or the runtime-info assembly — threw or timed out) so the caller
   * (`_tick`) can roll back the periodic watermark of the
   * slot it opened and retry that boundary. The error is **not** rethrown, so a
   * failing handler never produces an unhandled rejection. Clears the
   * `_inFlight` slot in `.finally()` so the next boundary produces a fresh
   * promise. For fire-once entries `firedKey` is added to `_firedOnce` on
   * success so subsequent ticks skip it.
   *
   * `getRuntimeInfo` is the user-facing aggregator: its sub-fetches (range,
   * info, price) are individually wrapped in `trycatch` with `null` fallbacks,
   * so it almost never throws for missing data. Whatever does throw — the
   * handler, or in rare cases `getRuntimeInfo` — is caught here and reported via
   * the returned `failed` flag; the watermark rollback treats both identically.
   *
   * @param context - Strategy/exchange/frame identifiers from the originating
   *   lifecycle event, forwarded to `getRuntimeInfo` to resolve `range`/`info`.
   * @param firedKey - Key to add to `_firedOnce` on success, or `null` for
   *   periodic entries (which never populate `_firedOnce`).
   * @param backtest - Forwarded to `getRuntimeInfo` and surfaced as
   *   `info.backtest`; the "winner" tick's flag is what all parallel awaiters
   *   of this slot see.
   * @returns `true` if the handler (or `getRuntimeInfo`) threw, `false` on
   *   success. `_tick` uses this to decide whether to roll back the watermark.
   */
  private async _runEntry(
    entry: CronEntry,
    symbol: string,
    alignedMs: number,
    slotKey: string,
    firedKey: string | null,
    backtest: boolean,
    context: { strategyName: string; exchangeName: string; frameName: string }
  ): Promise<boolean> {
    let failed = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    // Observational early warning: fires while the slot is still running, long
    // before the watchdog below forcibly fails it. Cancelled in `finally`, so
    // it never fires for slots that settle in time.
    const slowAlarm = setTimeout(() => {
      const message = `${CRON_METHOD_NAME_TICK} entry "${entry.name}" still running after ${CRON_HANDLER_WARN_TIMEOUT}ms (watchdog at ${CRON_HANDLER_TIMEOUT}ms)`;
      const payload = { symbol, alignedMs };
      LOGGER_SERVICE.warn(message, payload);
      console.error(message, payload);
    }, CRON_HANDLER_WARN_TIMEOUT);
    try {
      // The runtime-info assembly is raced alongside the handler: in live mode
      // getRuntimeInfo reaches out to the exchange for the current price, so it
      // can hang on a dead network exactly like a user handler can.
      const work = (async () => {
        const info = await RUNTIME_META_SERVICE.getRuntimeInfo(symbol, context, backtest);
        await entry.handler(info);
      })();
      // A timed-out slot abandons `work`; swallow its eventual rejection so a
      // zombie handler that fails later never surfaces as an unhandled
      // rejection. Its late success is equally unobserved: `failed` was already
      // reported and (for fire-once entries) the fired mark deliberately not set.
      work.catch(() => void 0);
      await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          watchdog = setTimeout(() => {
            reject(
              new Error(
                `Cron entry "${entry.name}" timed out after ${CRON_HANDLER_TIMEOUT}ms`
              )
            );
          }, CRON_HANDLER_TIMEOUT);
        }),
      ]);
    } catch (error) {
      failed = true;
      const message = `${CRON_METHOD_NAME_TICK} entry "${entry.name}" failed`;
      const payload = {
        symbol,
        alignedMs,
        error: errorData(error),
        message: getErrorMessage(error),
      };
      LOGGER_SERVICE.warn(message, payload);
      console.error(message, payload);
      errorEmitter.next(error as Error);
    } finally {
      clearTimeout(slowAlarm);
      clearTimeout(watchdog);
      this._inFlight.delete(slotKey);
      if (!failed && firedKey !== null) {
        this._firedOnce.add(firedKey);
      }
    }
    return failed;
  }

  /**
   * Register a periodic cron entry.
   *
   * Idempotent on `name`: re-registering the same name replaces the previous
   * entry (interval/symbols/handler can all change). Re-registration does
   * **not** clear in-flight promises — entries still resolving complete with
   * the previous handler.
   *
   * @param entry - Entry configuration; see {@link CronEntry}.
   * @returns Disposer function — call it to unregister the entry.
   *
   * @example
   * ```typescript
   * const dispose = Cron.register({
   *   name: "fetch-funding",
   *   interval: "8h",
   *   symbols: ["BTCUSDT", "ETHUSDT"],
   *   handler: async (info) => { ... },
   * });
   * // Later:
   * dispose();
   * ```
   */
  public register = (entry: CronEntry): CronHandle => {
    LOGGER_SERVICE.info(CRON_METHOD_NAME_REGISTER, {
      name: entry.name,
      interval: entry.interval,
      symbols: entry.symbols,
    });
    if (!entry.name) {
      throw new Error("CronUtils.register requires a non-empty name");
    }
    if (entry.name.includes(":")) {
      throw new Error(
        `CronUtils.register: name must not contain ':' (got "${entry.name}"). ` +
        `':' is reserved as the segment separator in slot keys.`
      );
    }
    if (entry.symbols) {
      for (const symbol of entry.symbols) {
        if (symbol.includes(":")) {
          throw new Error(
            `CronUtils.register: symbols[] entry must not contain ':' (got "${symbol}"). ` +
            `':' is reserved as the segment separator in slot keys.`
          );
        }
      }
    }
    this._clearFiredOnceFor(entry.name);
    this._clearBoundaryFor(entry.name);
    const generation = ++this._generationCounter;
    this._entries.set(entry.name, { entry, generation });
    return () => this.unregister(entry.name);
  };

  /**
   * Remove a registered entry by name.
   *
   * Does not cancel handlers already in flight — those resolve on their own
   * and clear their slot via `.finally()`.
   *
   * @param name - Name passed to `register`.
   */
  public unregister = (name: string): void => {
    LOGGER_SERVICE.info(CRON_METHOD_NAME_UNREGISTER, { name });
    this._entries.delete(name);
    this._clearFiredOnceFor(name);
    this._clearBoundaryFor(name);
  };

  /**
   * Clear fire-once marks so that fire-once entries can fire again.
   *
   * Does **not** touch `_inFlight` — that map holds shared in-flight handler
   * promises through which parallel `tick`s coordinate. Wiping it mid-flight
   * would let a new `tick` start a second handler for a boundary that's
   * already running, breaking the singleshot contract.
   *
   * Two modes:
   * - **Per-symbol** (`symbol` provided): clears only fan-out fire-once
   *   marks for that symbol — keys of the shape `${name}:${symbol}:g${gen}`.
   *   Global fire-once marks (`${name}:g${gen}`, no symbol component) are
   *   left intact, since they are not attributable to a single symbol.
   *   Useful for re-arming fan-out fire-once entries when a particular
   *   symbol's run finishes and you want a future re-run to fire again.
   * - **All** (no argument): wipes every fire-once mark across all entries
   *   and symbols. Registered entries are not removed — use `unregister`
   *   (or the disposer returned by `register`) for that.
   *
   * **Race with in-flight handlers.** `_firedOnce` is written in
   * `_runEntry`'s `.finally()`, which can run *after* a concurrent
   * `clear()` call. In that case the fire-once mark reappears immediately
   * after being wiped, and the next tick will treat the entry as already
   * fired. This is consistent with the singleshot promise itself surviving
   * `clear()` — the handler is allowed to finish — and the entry's
   * generation suffix in `firedKey` guarantees the stale mark cannot
   * outlive a subsequent `register()` of the same name. If you need a hard
   * re-arm, `unregister` + `register` bumps the generation and makes any
   * late write a no-op.
   *
   * @param symbol - Optional symbol filter; if omitted, clears all fire-once
   *   marks.
   */
  public clear = (symbol?: string): void => {
    LOGGER_SERVICE.info(CRON_METHOD_NAME_CLEAR, { symbol });
    if (!symbol) {
      this._firedOnce.clear();
      return;
    }
    const symbolSegment = `:${symbol}:`;
    for (const key of this._firedOnce) {
      if (key.includes(symbolSegment)) {
        this._firedOnce.delete(key);
      }
    }
  };

  /**
   * Process a virtual-time tick for `symbol` and fire any due cron entries.
   *
   * **Private.** Invoked exclusively by the lifecycle bridge installed in
   * {@link enable} — `beforeStart` / `idlePing` / `activePing` / `schedulePing`
   * are funneled here through a shared `singlerun` queue, so calls to
   * `_tick` are serialised end-to-end. Do not call directly.
   *
   * Algorithm (per registered entry):
   * 0. Base-align the incoming `when` down to the 1-minute boundary (`ts`).
   *    Lifecycle subjects may emit with sub-second jitter; rounding here
   *    guarantees that `beforeStart` / `idlePing` / `activePing` /
   *    `schedulePing` for the same virtual minute all hash to the same
   *    slot key.
   * 1. If `entry.symbols` is non-empty and does not include `symbol`, skip.
   * 2. Decide scope from `entry.symbols`:
   *    - Empty/undefined → **global** (slot key has no symbol component).
   *    - Non-empty → **fan-out**, slot key carries `:${symbol}` so each
   *      whitelisted symbol gets its own slot and handler invocation.
   * 3. Append the current entry generation suffix `:g${generation}` to both
   *    slot key and fired-once key. This isolates incarnations of the same
   *    `name`: a `register()` after an in-flight handler bumps the
   *    generation, so the late `_firedOnce` write from the old handler can
   *    never block the new entry.
   * 4. **Fire-once** (`entry.interval === undefined`):
   *    - If the entry's fired-once key is already in `_firedOnce`, skip.
   *    - Slot key: `${name}:once` (+ scope) (+ gen).
   *    - `alignedMs` = the 1-minute-aligned `when` from step 0 (`ts`).
   * 5. **Periodic** (`entry.interval` set):
   *    - Align `when` to the entry's interval via {@link alignToInterval} to
   *      get `alignedMs`, the boundary this tick belongs to.
   *    - Compare against the slot's watermark in `_lastBoundary` (keyed by
   *      `${name}` + scope + gen, without the `alignedMs` segment). If a
   *      watermark exists and `alignedMs <= lastBoundary`, this boundary was
   *      already fired — skip.
   *    - This **watermark** check replaces the old exact `ts === alignedMs`
   *      match. The exact match required virtual time to land *precisely* on
   *      the boundary; when a tick jumped clean over a boundary (e.g. a `5m`
   *      loop going 00:14 → 00:29 never touching the `15m` 00:15 boundary)
   *      the boundary was silently lost. With the watermark, the first tick
   *      whose `alignedMs` advanced past the stored value fires once, at the
   *      newest crossed boundary (catch-up collapses several skipped
   *      boundaries into a single invocation at the latest one).
   *    - The watermark is advanced to `alignedMs` synchronously when the slot
   *      is opened (before the `await`), so a concurrent tick on the same or
   *      an already-passed boundary cannot open a duplicate slot while the
   *      handler is still in flight.
   *    - Slot key: `${name}:${alignedMs}` (+ scope) (+ gen).
   * 6. Singleshot per slot key: look up the slot in `_inFlight`. If a promise
   *    already exists, `await` the same promise. Otherwise open the slot via
   *    {@link _runEntry} — which assembles the {@link IRuntimeInfo} snapshot
   *    (from `symbol`, `context`, `backtest`) and invokes `entry.handler(info)`
   *    — store the promise, and `await` it. The slot is removed in `.finally()`
   *    so the next boundary creates a fresh promise; for fire-once entries the
   *    fired-once key is also added to `_firedOnce` on success so subsequent
   *    ticks skip it.
   * 7. After `await Promise.all`, roll back the watermark for every **periodic**
   *    slot this tick *opened* (not the ones whose in-flight promise it reused)
   *    whose handler reported failure, so the next tick re-opens and re-runs
   *    that boundary.
   *
   * Errors thrown by `handler` are caught, logged via `console.error`, and
   * **not** rethrown — a failing handler must not break the per-symbol
   * tick loop or unblock other parallel backtests with an unhandled
   * rejection. A failed fire-once handler is **not** marked as fired and
   * will retry on the next tick. A failed **periodic** handler likewise
   * retries: the boundary watermark advanced at slot-open time is rolled back
   * after the slot settles (step 7), so the next tick re-opens that boundary.
   *
   * Requires active method context and execution context.
   *
   * @param symbol - Trading symbol from the current tick.
   * @param when - Virtual time of the current tick.
   * @param backtest - `true` for backtest ticks, `false` for live ticks.
   *   Forwarded to {@link _runEntry} and surfaced as `info.backtest`. Only the
   *   value from the tick that **opens** a given slot is observed by all
   *   parallel awaiters of that slot.
   * @param context - Strategy/exchange/frame identifiers from the originating
   *   lifecycle event, forwarded to `RuntimeMetaService.getRuntimeInfo` to
   *   build the {@link IRuntimeInfo} snapshot passed to the handler.
   * @throws Error if method or execution context is missing.
   */
  private _tick = async (
    symbol: string,
    when: Date,
    backtest: boolean,
    context: { strategyName: string; exchangeName: string; frameName: string }
  ): Promise<void> => {
    LOGGER_SERVICE.debug(CRON_METHOD_NAME_TICK, {
      symbol,
      when,
      context,
    });

    if (!MethodContextService.hasContext()) {
      throw new Error("CronUtils _tick requires method context");
    }
    if (!ExecutionContextService.hasContext()) {
      throw new Error("CronUtils _tick requires execution context");
    }

    const ts = alignToInterval(when, "1m").getTime();
    const taskList: Promise<boolean>[] = [];
    // Periodic slots THIS tick actually opened (the `!pending` branch), tracked
    // for watermark rollback on failure. See {@link IOpenedSlot} for what is and
    // is not recorded here and why.
    const openedList: ICronOpenedSlot[] = [];

    for (const { entry, generation } of this._entries.values()) {
      if (entry.symbols?.length && !entry.symbols.includes(symbol)) {
        continue;
      }

      const perSymbol = !!entry.symbols?.length;
      const scope = perSymbol ? `:${symbol}` : "";
      const genSuffix = `:g${generation}`;

      let alignedMs: number;
      let slotKey: string;
      let firedKey: string | null;
      // Periodic-only watermark key (no `alignedMs` segment); null for
      // fire-once entries, which coordinate via `_firedOnce` instead.
      let boundaryKey: string | null;

      if (entry.interval === undefined) {
        const onceKey = `${entry.name}${scope}${genSuffix}`;
        if (this._firedOnce.has(onceKey)) {
          continue;
        }
        alignedMs = ts;
        slotKey = `${entry.name}:once${scope}${genSuffix}`;
        firedKey = onceKey;
        boundaryKey = null;
      } else {
        alignedMs = alignToInterval(when, entry.interval).getTime();
        boundaryKey = `${entry.name}${scope}${genSuffix}`;
        const lastBoundary = this._lastBoundary.get(boundaryKey);
        // Fire when the tick's aligned boundary has advanced past the last one
        // we fired for this slot. Using `>` instead of the old `ts === alignedMs`
        // means a virtual-time jump that skips clean over a boundary still
        // fires once, at the newest crossed boundary, rather than dropping it.
        if (lastBoundary !== undefined && alignedMs <= lastBoundary) {
          continue;
        }
        slotKey = `${entry.name}:${alignedMs}${scope}${genSuffix}`;
        firedKey = null;
      }

      let pending = this._inFlight.get(slotKey);

      if (!pending) {
        // Advance the watermark synchronously at slot-open time, before the
        // await below. Otherwise a later tick on the same (or an already
        // crossed) boundary, arriving while this handler is still in flight,
        // would see the stale watermark and open a duplicate slot. The advance
        // is rolled back after the slot settles if the handler failed (see the
        // post-await loop below), so a failed boundary is retried next tick.
        if (boundaryKey !== null) {
          // Capture the pre-advance value so it can be restored verbatim on
          // failure (undefined => the boundary had never opened => delete the
          // key on rollback). Read fresh here rather than reusing `lastBoundary`
          // above to keep the value↔slot binding local and obvious; there is no
          // `await` between the two reads, so they are identical.
          const prevBoundary = this._lastBoundary.get(boundaryKey);
          this._lastBoundary.set(boundaryKey, alignedMs);
          pending = this._runEntry(entry, symbol, alignedMs, slotKey, firedKey, backtest, context);
          this._inFlight.set(slotKey, pending);
          openedList.push({ boundaryKey, prevBoundary, pending });
        } else {
          pending = this._runEntry(entry, symbol, alignedMs, slotKey, firedKey, backtest, context);
          this._inFlight.set(slotKey, pending);
        }
      }

      taskList.push(pending);
    }

    // Every slot self-terminates via the `_runEntry` watchdog, so this settles
    // within CRON_HANDLER_TIMEOUT plus epsilon even when a handler hangs.
    await Promise.all(taskList);

    // Roll back the watermark for any periodic slot THIS tick opened whose
    // handler failed, so the next tick re-opens the same boundary and retries
    // it — mirroring how a skipped boundary is later caught up. Restoring
    // `prevBoundary` (or deleting the key when it was `undefined`) re-arms the
    // strict-`>` gate without disturbing any earlier already-fired boundary.
    // `await pending` is cheap — every promise already settled in `Promise.all`
    // above; we re-await via `openedList` because its entries (opened slots
    // only) do not line up with `taskList` indices.
    for (const { boundaryKey, prevBoundary, pending } of openedList) {
      const failed = await pending;
      if (!failed) {
        continue;
      }
      if (prevBoundary === undefined) {
        this._lastBoundary.delete(boundaryKey);
      } else {
        this._lastBoundary.set(boundaryKey, prevBoundary);
      }
    }
  };

  /**
   * Subscribe `Cron` to the engine's strategy lifecycle subjects so registered
   * entries fire automatically — no manual wiring of `listenTickBacktest` /
   * `listenSchedulePing` etc. needed.
   *
   * Subjects funneled into {@link _tick}:
   * - `beforeStartSubject` — first event of every run.
   * - `idlePingSubject` — every tick when no signal is pending or scheduled.
   * - `activePingSubject` — every tick while a pending signal is being monitored.
   * - `schedulePingSubject` — every tick while a scheduled signal is being monitored.
   *
   * All four subjects are subscribed to a single `singlerun`-wrapped
   * handler that builds `_tick(event.symbol, new Date(event.timestamp),
   * event.backtest, { strategyName, exchangeName, frameName })`. The context
   * object is read uniformly from the event — every contract carries
   * `strategyName`, `exchangeName` and `frameName` at the top level (Active /
   * Schedule contracts gained `frameName` for exactly this reason), so no
   * per-event branching is needed. `singlerun` merges the four streams into one serial
   * queue: at most one `_tick` runs at a time, the next waits. This matters
   * because the engine can emit `beforeStart` and an immediate `idlePing`
   * on the very same minute, and concurrent `_tick`s on the same
   * `(symbol, minute)` would otherwise race to open the same `_inFlight`
   * slot before either commit. Together these four sources cover every
   * tick the engine processes for every `(symbol, virtual-minute)` pair
   * regardless of whether the strategy is idle, active, or scheduled.
   *
   * `enable` itself is wrapped in `singleshot`, so calling it repeatedly is
   * a no-op — subsequent calls return the same disposer. The disposer
   * unsubscribes from every subject and resets the singleshot so a future
   * `enable()` can re-subscribe cleanly. Equivalent to the
   * `RecentAdapter.enable` pattern.
   *
   * The `.subscribe` callbacks are synchronous wrappers around the
   * `singlerun`-async handler; `_tick`'s returned promise is awaited inside
   * `singlerun` to enforce ordering but not bubbled back to the subject.
   * Errors are caught and logged inside `_runEntry`.
   *
   * @returns Cleanup function that unsubscribes from all four subjects and
   *   resets the singleshot. Idempotent.
   *
   * @example
   * ```typescript
   * import { Cron } from "backtest-kit";
   *
   * Cron.register({ name: "tg-parser", interval: "1h", handler });
   * Cron.enable(); // wire once at startup
   * // ... run backtests / live as usual
   * Cron.disable(); // on shutdown
   * ```
   */
  public enable = singleshot(() => {
    LOGGER_SERVICE.info(CRON_METHOD_NAME_ENABLE);

    const handleTick = singlerun(async (event: BeforeStartContract | IdlePingContract | ActivePingContract | SchedulePingContract) => {
      return await this._tick(
        event.symbol,
        new Date(event.timestamp),
        event.backtest,
        {
          strategyName: event.strategyName,
          exchangeName: event.exchangeName,
          frameName: event.frameName,
        },
      );
    })

    const unBeforeStart = beforeStartSubject.subscribe(handleTick);
    const unIdlePing = idlePingSubject.subscribe(handleTick);
    const unActivePing = activePingSubject.subscribe(handleTick);
    const unSchedulePing = schedulePingSubject.subscribe(handleTick);

    return compose(
      () => unBeforeStart(),
      () => unIdlePing(),
      () => unActivePing(),
      () => unSchedulePing(),
      () => this.enable.clear(),
    );
  });

  /**
   * Tear down the lifecycle subscriptions installed by {@link enable}.
   *
   * Safe to call multiple times and safe to call before `enable()` — both
   * are no-ops. Does **not** unregister entries, does **not** touch
   * `_inFlight`, and does **not** wipe `_firedOnce` (use `unregister` or
   * `clear()` for those).
   */
  public disable = (): void => {
    LOGGER_SERVICE.info(CRON_METHOD_NAME_DISABLE);
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  /**
   * Hard-reset the entire `Cron` state.
   *
   * Performs in order:
   * 1. {@link disable} — tears down lifecycle subscriptions and resets the
   *    `enable` singleshot so a future `enable()` re-subscribes cleanly.
   * 2. Wipes `_entries` — every {@link register}'ed entry is forgotten.
   *    Disposers returned by previous `register()` calls become no-ops
   *    (their `unregister(name)` will not find anything to remove).
   * 3. Wipes `_firedOnce` — all fire-once marks are dropped, so any future
   *    re-registration of the same `name` fires again on the next matching
   *    tick.
   * 4. Wipes `_lastBoundary` — all periodic watermarks are dropped, so a
   *    re-registered periodic entry starts firing from its next crossed
   *    boundary again.
   * 5. Does **not** touch `_inFlight` — in-flight handlers continue to
   *    settle in the background and clear their own slots via `.finally()`.
   *    Their final `_firedOnce.add(firedKey)` writes carry old-generation
   *    keys and are harmless (lookup uses the post-dispose generation).
   *
   * Use from a CLI/session teardown when you want to throw away every
   * registration along with the lifecycle wiring — e.g. between two
   * independent runner scopes. For "just snap the subscriptions but keep
   * registrations" use {@link disable} instead; for "just re-arm fire-once
   * marks" use {@link clear}.
   *
   * Idempotent. Safe to call multiple times and safe to call before
   * `enable()` / without any registrations.
   */
  public dispose = (): void => {
    LOGGER_SERVICE.info(CRON_METHOD_NAME_DISPOSE);
    this.disable();
    this._entries.clear();
    this._firedOnce.clear();
    this._lastBoundary.clear();
  };
}

/**
 * Singleton instance of {@link CronUtils} for registering periodic tasks
 * coordinated across parallel `Backtest.background` runs.
 *
 * @example
 * ```typescript
 * import { Cron } from "backtest-kit";
 *
 * Cron.register({
 *   name: "tg-parser",
 *   interval: "1h",
 *   handler: async (info) => { ... },
 * });
 * ```
 */
export const Cron = new CronUtils();
