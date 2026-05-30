import { compose, singlerun, singleshot } from "functools-kit";
import LoggerService from "../lib/services/base/LoggerService";
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
} from "../config/emitters";
import { BeforeStartContract } from "../contract/BeforeStart.contract";
import IdlePingContract from "../contract/IdlePing.contract";
import ActivePingContract from "../contract/ActivePing.contract";
import SchedulePingContract from "../contract/SchedulePing.contract";

const CRON_METHOD_NAME_REGISTER = "CronUtils.register";
const CRON_METHOD_NAME_UNREGISTER = "CronUtils.unregister";
const CRON_METHOD_NAME_CLEAR = "CronUtils.clear";
const CRON_METHOD_NAME_TICK = "CronUtils._tick";
const CRON_METHOD_NAME_ENABLE = "CronUtils.enable";
const CRON_METHOD_NAME_DISABLE = "CronUtils.disable";

/**
 * Local logger instance.
 *
 * Created directly rather than resolved from the DI container so that
 * `CronUtils` has no compile-time dependency on the rest of the framework
 * being bootstrapped — `Cron` can be imported and used in isolation.
 */
const LOGGER_SERVICE = new LoggerService();

/**
 * Callback signature for a cron entry handler.
 *
 * Invocation cardinality depends on `entry.symbols` (see {@link CronEntry}):
 * - **Global mode** (`symbols` empty/undefined): invoked once per aligned
 *   boundary across all parallel backtests. The first symbol to reach the
 *   boundary opens the slot and runs the handler; others await the same
 *   promise.
 * - **Fan-out mode** (`symbols` non-empty): invoked once per aligned
 *   boundary **per whitelisted symbol**. Each symbol has its own slot.
 *
 * @param symbol - In global mode: the symbol of the backtest that first
 *   reached the boundary (the singleshot "winner"). In fan-out mode: the
 *   whitelisted symbol whose tick produced this invocation.
 * @param when - The aligned virtual time at which the entry fires.
 *   Already aligned to the entry's `interval` boundary (e.g. for `1h`,
 *   minutes/seconds/ms are zero). In fire-once mode this is the tick time
 *   aligned to the 1-minute boundary (the base alignment `_tick` applies
 *   to every incoming tick), not raw wall-clock with sub-second precision.
 * @param backtest - Execution-mode flag taken from the originating lifecycle
 *   event (`beforeStart` / `idlePing` / `activePing` / `schedulePing`,
 *   wired by `Cron.enable()`). `true` for backtest runs, `false` for live.
 *   The value reflects the **opening** tick that won the singleshot for
 *   this slot — all parallel awaiters of the same slot observe the same
 *   value, even if a later concurrent tick carried a different one.
 */
export type CronCallback = (
  symbol: string,
  when: Date,
  backtest: boolean
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
 *   handler: async (symbol, when, backtest) => { ... },
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
 *   handler: async (symbol, when, backtest) => {
 *     await parseTelegramSignalsToMongo(when);
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
   * Value is the shared in-flight handler promise. Every parallel `tick` for
   * the same slot key awaits this exact promise (mutex semantics) and is
   * released together when it settles. `_inFlight` is owned exclusively by
   * `_runEntry` — `clear()` does **not** touch it, so the singleshot promise
   * survives concurrent `clear` calls and continues to coordinate parallel
   * ticks until it settles.
   */
  private readonly _inFlight = new Map<string, Promise<void>>();

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
   * Invokes `entry.handler(symbol, aligned, backtest)`, swallows and logs
   * any error via `console.error`, and clears the `_inFlight` slot
   * in `.finally()` so the next boundary produces a fresh promise. For
   * fire-once entries `firedKey` is added to `_firedOnce` on success so
   * subsequent ticks skip it.
   *
   * @param firedKey - Key to add to `_firedOnce` on success, or `null` for
   *   periodic entries (which never populate `_firedOnce`).
   * @param backtest - Value forwarded as the third handler argument; the
   *   "winner" tick's flag is what all parallel awaiters of this slot see.
   */
  private async _runEntry(
    entry: CronEntry,
    symbol: string,
    aligned: Date,
    alignedMs: number,
    slotKey: string,
    firedKey: string | null,
    backtest: boolean
  ): Promise<void> {
    let failed = false;
    try {
      await entry.handler(symbol, aligned, backtest);
    } catch (err) {
      failed = true;
      console.error(
        `${CRON_METHOD_NAME_TICK} entry "${entry.name}" failed`,
        { symbol, alignedMs, err }
      );
    } finally {
      this._inFlight.delete(slotKey);
      if (!failed && firedKey !== null) {
        this._firedOnce.add(firedKey);
      }
    }
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
   *   handler: async (symbol, when, backtest) => { ... },
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
   *    - `aligned` = the 1-minute-aligned `when` from step 0.
   * 5. **Periodic** (`entry.interval` set):
   *    - Align `when` further to the entry's interval via {@link alignToInterval}.
   *    - If `ts !== alignedMs`, the tick is mid-interval — skip.
   *      (This is the "remainder === 0" boundary check from the spec;
   *      since `ts` is already on the 1-minute boundary, the check is exact
   *      for `1m` and consistent for higher intervals.)
   *    - Slot key: `${name}:${alignedMs}` (+ scope) (+ gen).
   * 6. Singleshot per slot key: look up the slot in `_inFlight`. If a promise
   *    already exists, `await` the same promise. Otherwise invoke
   *    `entry.handler`, store the promise, and `await` it. The slot is
   *    removed in `.finally()` so the next boundary creates a fresh promise;
   *    for fire-once entries the fired-once key is also added to
   *    `_firedOnce` on success so subsequent ticks skip it.
   *
   * Errors thrown by `handler` are caught, logged via `console.error`, and
   * **not** rethrown — a failing handler must not break the per-symbol
   * tick loop or unblock other parallel backtests with an unhandled
   * rejection. A failed fire-once handler is **not** marked as fired and
   * will retry on the next tick.
   *
   * Requires active method context and execution context.
   *
   * @param symbol - Trading symbol from the current tick.
   * @param when - Virtual time of the current tick.
   * @param backtest - `true` for backtest ticks, `false` for live ticks.
   *   Forwarded as the third argument to `entry.handler`. Only the value
   *   from the tick that **opens** a given slot is observed by all parallel
   *   awaiters of that slot.
   * @throws Error if method or execution context is missing.
   */
  private _tick = async (symbol: string, when: Date, backtest: boolean): Promise<void> => {
    LOGGER_SERVICE.debug(CRON_METHOD_NAME_TICK, {
      symbol,
      when,
    });

    if (!MethodContextService.hasContext()) {
      throw new Error("CronUtils _tick requires method context");
    }
    if (!ExecutionContextService.hasContext()) {
      throw new Error("CronUtils _tick requires execution context");
    }

    const ts = alignToInterval(when, "1m").getTime();
    const taskList: Promise<void>[] = [];

    for (const { entry, generation } of this._entries.values()) {
      if (entry.symbols?.length && !entry.symbols.includes(symbol)) {
        continue;
      }

      const perSymbol = !!entry.symbols?.length;
      const scope = perSymbol ? `:${symbol}` : "";
      const genSuffix = `:g${generation}`;

      let aligned: Date;
      let alignedMs: number;
      let slotKey: string;
      let firedKey: string | null;

      if (entry.interval === undefined) {
        const onceKey = `${entry.name}${scope}${genSuffix}`;
        if (this._firedOnce.has(onceKey)) {
          continue;
        }
        aligned = alignToInterval(when, "1m");
        alignedMs = ts;
        slotKey = `${entry.name}:once${scope}${genSuffix}`;
        firedKey = onceKey;
      } else {
        aligned = alignToInterval(when, entry.interval);
        alignedMs = aligned.getTime();
        if (ts !== alignedMs) {
          continue;
        }
        slotKey = `${entry.name}:${alignedMs}${scope}${genSuffix}`;
        firedKey = null;
      }

      let pending = this._inFlight.get(slotKey);

      if (!pending) {
        pending = this._runEntry(entry, symbol, aligned, alignedMs, slotKey, firedKey, backtest);
        this._inFlight.set(slotKey, pending);
      }

      taskList.push(pending);
    }

    await Promise.all(taskList);
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
   * event.backtest)`. `singlerun` merges the four streams into one serial
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
      return await this._tick(event.symbol, new Date(event.timestamp), event.backtest);
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
 *   handler: async (symbol, when, backtest) => { ... },
 * });
 * ```
 */
export const Cron = new CronUtils();
