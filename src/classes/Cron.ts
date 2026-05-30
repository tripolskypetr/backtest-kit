import { CandleInterval } from "../interfaces/Exchange.interface";
import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { alignToInterval } from "../utils/alignToInterval";

const CRON_METHOD_NAME_REGISTER = "CronUtils.register";
const CRON_METHOD_NAME_UNREGISTER = "CronUtils.unregister";
const CRON_METHOD_NAME_RESET = "CronUtils.reset";
const CRON_METHOD_NAME_RESET_ALL = "CronUtils.resetAll";
const CRON_METHOD_NAME_TICK = "CronUtils.tick";

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
 *   minutes/seconds/ms are zero). In fire-once mode this is the raw tick
 *   time (no align).
 */
export type CronCallback = (
  symbol: string,
  when: Date
) => void | Promise<void>;

/**
 * Configuration for a registered cron entry.
 */
export interface CronEntry {
  /**
   * Unique name of the entry. Used as the dedup key on `register` (re-registering
   * the same name replaces the previous entry) and as part of the singleshot
   * coordination key.
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
 * const dispose = Cron.register({ name: "x", interval: "1h", handler });
 * dispose(); // unregisters
 * ```
 */
export interface CronHandle {
  (): void;
}

/**
 * Internal bookkeeping for a single in-flight singleshot slot.
 *
 * One `ICronInFlightSlot` lives in `CronUtils._inFlight` per active
 * `(name, alignedMs)` pair from the moment the first parallel `tick`
 * opens it until `_runEntry`'s `.finally()` removes it.
 *
 * Not exported — `CronUtils` is the only owner.
 */
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

interface ICronInFlightSlot {
  /**
   * Shared handler promise. Every parallel `tick` for the same slot
   * awaits this exact promise (mutex semantics) and is released together
   * when it settles.
   */
  promise: Promise<void>;
  /**
   * Symbol of the backtest that first reached the boundary and opened
   * the slot. Used by `reset(symbol)` to drop only the slots that this
   * particular backtest started, leaving slots opened by other still-
   * running backtests intact.
   */
  initiator: string;
  /**
   * Identity token that lets `_runEntry`'s `.finally()` tell whether the
   * slot currently sitting under its `slotKey` is still the one it owns.
   * After `reset(symbol)` drops a slot and a later tick creates a fresh
   * slot under the same key, the old handler's `.finally()` would otherwise
   * delete the new slot. The token check prevents that.
   */
  token: symbol;
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
 * import { Cron, listenTickBacktest, listenDoneBacktest, Backtest } from "backtest-kit";
 *
 * Cron.register({
 *   name: "tg-signal-parser",
 *   interval: "1h",
 *   handler: async (symbol, when) => {
 *     await parseTelegramSignalsToMongo(when);
 *   },
 * });
 *
 * listenTickBacktest(async ({ symbol, date }) => {
 *   await Cron.tick(symbol, date);
 * });
 *
 * listenDoneBacktest(({ symbol }) => {
 *   Cron.reset(symbol);
 * });
 *
 * for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "TRXUSDT"]) {
 *   Backtest.background(symbol, { strategyName, exchangeName, frameName });
 * }
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
   * In-flight handler slots keyed by `${name}:${alignedMs}` (periodic) or
   * `${name}:once` (fire-once). See {@link ICronInFlightSlot} for the slot
   * shape and how `initiator` is used by `reset(symbol)`.
   */
  private readonly _inFlight = new Map<string, ICronInFlightSlot>();

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
   * Stale entries are pruned by `_clearFiredOnceFor` on `unregister` and
   * wiped by `resetAll`.
   *
   * Looked up by `tick` to decide whether to skip; written by `_runEntry`
   * on successful settle.
   */
  private readonly _firedOnce = new Set<string>();

  /**
   * Garbage-collect every `_firedOnce` key that belongs to the entry `name`
   * (any generation, global or fan-out).
   *
   * Called from `unregister` to free memory; **not** required for
   * correctness — the generation suffix already isolates re-registrations,
   * so leftover keys from old generations can never block a new entry.
   * They just sit unused until they are GC'd here or by `resetAll`.
   */
  private _clearFiredOnceFor(name: string): void {
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
   * Invokes `entry.handler`, swallows and logs any error via
   * `loggerService.warn`, and clears the `_inFlight` slot in `.finally()`
   * so the next boundary produces a fresh promise. For fire-once entries
   * `firedKey` is added to `_firedOnce` on success so subsequent ticks
   * skip it.
   *
   * @param firedKey - Key to add to `_firedOnce` on success, or `null` for
   *   periodic entries (which never populate `_firedOnce`).
   */
  private async _runEntry(
    entry: CronEntry,
    symbol: string,
    aligned: Date,
    alignedMs: number,
    slotKey: string,
    firedKey: string | null,
    token: symbol
  ): Promise<void> {
    let failed = false;
    try {
      await entry.handler(symbol, aligned);
    } catch (err) {
      failed = true;
      backtest.loggerService.warn(
        `${CRON_METHOD_NAME_TICK} entry "${entry.name}" failed`,
        { symbol, alignedMs, err }
      );
    } finally {
      const current = this._inFlight.get(slotKey);
      if (current && current.token === token) {
        this._inFlight.delete(slotKey);
      }
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
   *   handler: async (symbol, when) => { ... },
   * });
   * // Later:
   * dispose();
   * ```
   */
  public register = (entry: CronEntry): CronHandle => {
    backtest.loggerService.info(CRON_METHOD_NAME_REGISTER, {
      name: entry.name,
      interval: entry.interval,
      symbols: entry.symbols,
    });
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
    backtest.loggerService.info(CRON_METHOD_NAME_UNREGISTER, { name });
    this._entries.delete(name);
    this._clearFiredOnceFor(name);
  };

  /**
   * Clear in-flight singleshot slots that were opened by `symbol`.
   *
   * Each slot records the symbol that opened it (the singleshot "winner" —
   * the first parallel tick to reach the boundary). This method removes only
   * those slots whose initiator matches `symbol`, leaving slots opened by
   * other symbols intact — important when one backtest in a parallel batch
   * finishes while the others are still running.
   *
   * Note: this only drops bookkeeping entries; the underlying handler
   * promises are not cancelled and continue to settle in the background.
   *
   * @param symbol - Symbol whose backtest is finishing.
   */
  public reset = (symbol: string): void => {
    backtest.loggerService.info(CRON_METHOD_NAME_RESET, { symbol });
    for (const [slotKey, slot] of this._inFlight) {
      if (slot.initiator === symbol) {
        this._inFlight.delete(slotKey);
      }
    }
  };

  /**
   * Clear all in-flight singleshot promises across all entries and symbols.
   *
   * Does not remove registered entries — use `unregister` for that.
   */
  public resetAll = (): void => {
    backtest.loggerService.info(CRON_METHOD_NAME_RESET_ALL);
    this._inFlight.clear();
    this._firedOnce.clear();
  };

  /**
   * Process a virtual-time tick for `symbol` and fire any due cron entries.
   *
   * Algorithm (per registered entry):
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
   *    - Use raw `when` (no align).
   * 5. **Periodic** (`entry.interval` set):
   *    - Align `when` to the interval boundary via {@link alignToInterval}.
   *    - If `when.getTime() !== alignedMs`, the tick is mid-interval — skip.
   *      (This is the "remainder === 0" boundary check from the spec.)
   *    - Slot key: `${name}:${alignedMs}` (+ scope) (+ gen).
   * 6. Singleshot per slot key: look up the slot in `_inFlight`. If a promise
   *    already exists, `await` the same promise. Otherwise invoke
   *    `entry.handler`, store the promise, and `await` it. The slot is
   *    removed in `.finally()` so the next boundary creates a fresh promise;
   *    for fire-once entries the fired-once key is also added to
   *    `_firedOnce` on success so subsequent ticks skip it.
   *
   * Errors thrown by `handler` are caught, logged via `loggerService.warn`,
   * and **not** rethrown — a failing handler must not break the per-symbol
   * tick loop or unblock other parallel backtests with an unhandled
   * rejection. A failed fire-once handler is **not** marked as fired and
   * will retry on the next tick.
   *
   * Requires active method context and execution context.
   *
   * @param symbol - Trading symbol from the current backtest tick.
   * @param when - Virtual time of the current backtest tick.
   * @throws Error if method or execution context is missing.
   */
  public tick = async (symbol: string, when: Date): Promise<void> => {
    backtest.loggerService.debug(CRON_METHOD_NAME_TICK, {
      symbol,
      when,
    });

    if (!MethodContextService.hasContext()) {
      throw new Error("CronUtils tick requires method context");
    }
    if (!ExecutionContextService.hasContext()) {
      throw new Error("CronUtils tick requires execution context");
    }

    const ts = when.getTime();

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
        aligned = when;
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

      let slot = this._inFlight.get(slotKey);

      if (!slot) {
        const token = Symbol();
        const promise = this._runEntry(entry, symbol, aligned, alignedMs, slotKey, firedKey, token);
        slot = { promise, initiator: symbol, token };
        this._inFlight.set(slotKey, slot);
      }

      await slot.promise;
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
 *   handler: async (symbol, when) => { ... },
 * });
 * ```
 */
export const Cron = new CronUtils();
