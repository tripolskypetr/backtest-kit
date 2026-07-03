import { memoize, singleshot } from "functools-kit";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { PersistSessionAdapter } from "./Persist";
import swarm from "../lib";

type Key =
  | `${string}:${StrategyName}:${ExchangeName}:${FrameName}:${"backtest"}`
  | `${string}:${StrategyName}:${ExchangeName}:${"live"}`;

const CREATE_KEY_FN = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): Key => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":") as Key;
};

const SESSION_LOCAL_INSTANCE_METHOD_NAME_GET = "SessionLocalInstance.getData";
const SESSION_LOCAL_INSTANCE_METHOD_NAME_SET = "SessionLocalInstance.setData";

const SESSION_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT = "SessionPersistInstance.waitForInit";
const SESSION_PERSIST_INSTANCE_METHOD_NAME_GET = "SessionPersistInstance.getData";
const SESSION_PERSIST_INSTANCE_METHOD_NAME_SET = "SessionPersistInstance.setData";

const SESSION_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE = "SessionBacktestAdapter.dispose";
const SESSION_BACKTEST_ADAPTER_METHOD_NAME_GET = "SessionBacktestAdapter.getData";
const SESSION_BACKTEST_ADAPTER_METHOD_NAME_SET = "SessionBacktestAdapter.setData";
const SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL = "SessionBacktestAdapter.useLocal";
const SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST = "SessionBacktestAdapter.usePersist";
const SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY = "SessionBacktestAdapter.useDummy";
const SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_SESSION_ADAPTER = "SessionBacktestAdapter.useSessionAdapter";
const SESSION_BACKTEST_ADAPTER_METHOD_NAME_CLEAR = "SessionBacktestAdapter.clear";

const SESSION_LIVE_ADAPTER_METHOD_NAME_DISPOSE = "SessionLiveAdapter.dispose";
const SESSION_LIVE_ADAPTER_METHOD_NAME_GET = "SessionLiveAdapter.getData";
const SESSION_LIVE_ADAPTER_METHOD_NAME_SET = "SessionLiveAdapter.setData";
const SESSION_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL = "SessionLiveAdapter.useLocal";
const SESSION_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST = "SessionLiveAdapter.usePersist";
const SESSION_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY = "SessionLiveAdapter.useDummy";
const SESSION_LIVE_ADAPTER_METHOD_NAME_USE_SESSION_ADAPTER = "SessionLiveAdapter.useSessionAdapter";
const SESSION_LIVE_ADAPTER_METHOD_NAME_CLEAR = "SessionLiveAdapter.clear";

const SESSION_ADAPTER_METHOD_NAME_GET = "SessionAdapter.getData";
const SESSION_ADAPTER_METHOD_NAME_SET = "SessionAdapter.setData";

/**
 * Interface for session instance implementations.
 * Defines the contract for local, persist, and dummy backends.
 *
 * Intended use: per-(symbol, strategy, exchange, frame) mutable session data
 * shared across strategy callbacks within a single run — e.g. caching LLM
 * inference results, intermediate indicator state, or cross-candle accumulators.
 *
 * Example shape:
 * ```ts
 * { lastLlmSignal: "buy" | "sell" | null; confirmedAt: number }
 * ```
 */
export interface ISessionInstance {
  /**
   * Initialize the session instance.
   * @param initial - Whether this is the first initialization
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Write a new session value.
   * @param value - New value or null to clear
   * @param when - Logical timestamp this value belongs to.
   *               A write with a smaller `when` overwrites an existing record —
   *               that lets a restarted backtest reset live-written state.
   */
  setData<Value extends object = object>(value: Value | null, when: Date): Promise<void>;

  /**
   * Read the current session value.
   * Returns null when the stored `when` is greater than the requested `when`
   * (look-ahead bias protection).
   * @param when - Logical timestamp at which the read is happening
   * @returns Current session value, or null if not set / look-ahead
   */
  getData<Value extends object = object>(when: Date): Promise<Value | null>;

  /**
   * Releases any resources held by this instance.
   */
  dispose(): Promise<void>;
}

/**
 * Constructor type for session instance implementations.
 * Used for swapping backends via SessionBacktestAdapter / SessionLiveAdapter.
 */
export type TSessionInstanceCtor = new (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean,
) => ISessionInstance;

/**
 * Public surface of SessionBacktestAdapter / SessionLiveAdapter — ISessionInstance minus waitForInit and dispose.
 * waitForInit and dispose are managed internally by the adapter.
 */
type TSessionAdapter = {
  [key in Exclude<keyof ISessionInstance, "waitForInit" | "dispose">]: any;
};

/**
 * In-process session instance backed by a plain object reference.
 * All data lives in process memory only — no disk persistence.
 *
 * Features:
 * - Mutable in-memory session data
 * - Scoped per (symbol, strategyName, exchangeName, frameName) tuple
 *
 * Use for backtesting and unit tests where persistence between runs is not needed.
 */
export class SessionLocalInstance implements ISessionInstance {
  _data: unknown = null;
  _when: number = 0;

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
  ) { }

  /**
   * Initializes _data to null — local session needs no async setup.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    this._data = null;
    this._when = 0;
  });

  /**
   * Read the current in-memory session value.
   * Returns null if the stored `when` is greater than the requested `when`
   * (look-ahead bias protection).
   * @param when - Logical timestamp at which the read is happening
   * @returns Current session value, or null
   */
  public getData = async <Value extends object = object>(when: Date): Promise<Value | null> => {
    swarm.loggerService.debug(SESSION_LOCAL_INSTANCE_METHOD_NAME_GET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
    if (this._when > when.getTime()) {
      return null;
    }
    return <Value>this._data;
  };

  /**
   * Update the in-memory session value.
   * Records `when` so future reads with a smaller `when` see no value.
   * @param value - New value or null to clear
   * @param when - Logical timestamp this value belongs to
   */
  public setData = async <Value extends object = object>(value: Value | null, when: Date): Promise<void> => {
    swarm.loggerService.debug(SESSION_LOCAL_INSTANCE_METHOD_NAME_SET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
    this._data = value;
    this._when = when.getTime();
  };

  /** Releases resources held by this instance. */
  public async dispose(): Promise<void> {
    swarm.loggerService.debug(SESSION_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
  }
}

/**
 * No-op session instance that discards all writes.
 * Used for disabling session storage in tests or dry-run scenarios.
 *
 * Useful when replaying historical candles without needing to accumulate
 * cross-candle session state — getData always returns null.
 */
export class SessionDummyInstance implements ISessionInstance {
  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
  ) { }

  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    void 0;
  });

  /**
   * No-op read — always returns null.
   * @returns null
   */
  public getData = async <Value extends object = object>(_when: Date): Promise<Value | null> => {
    return null;
  };

  /**
   * No-op write — discards the value.
   */
  public setData = async <Value extends object = object>(_value: Value | null, _when: Date): Promise<void> => {
    void 0;
  };

  /** No-op. */
  public async dispose(): Promise<void> {
    void 0;
  }
}

/**
 * File-system backed session instance.
 * Data is persisted atomically to disk via PersistSessionAdapter.
 * Session is restored from disk on waitForInit.
 *
 * Features:
 * - Crash-safe atomic file writes
 * - Scoped per (symbol, strategyName, exchangeName, frameName) tuple
 *
 * Use in live trading to survive process restarts mid-session.
 */
export class SessionPersistInstance implements ISessionInstance {
  _data: unknown = null;
  _when: number = 0;

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
  ) { }

  /**
   * Initialize persistence storage and restore session from disk.
   * @param initial - Whether this is the first initialization
   */
  public waitForInit = singleshot(async (initial: boolean) => {
    swarm.loggerService.debug(SESSION_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      initial,
    });
    await PersistSessionAdapter.waitForInit(this.strategyName, this.exchangeName, this.frameName, initial, this.symbol, this.backtest);
    const data = await PersistSessionAdapter.readSessionData(this.strategyName, this.exchangeName, this.frameName, this.symbol, this.backtest);
    const expectedId = CREATE_KEY_FN(this.symbol, this.strategyName, this.exchangeName, this.frameName, this.backtest);
    if (data && data.id !== expectedId) {
      // A record keyed for another context (e.g. a different symbol sharing the
      // same storage slot in a custom adapter) must never be restored here —
      // restoring it would leak one symbol's session state into another.
      const message = `SessionPersistInstance: persisted session id mismatch, ignoring record (expected=${expectedId}, got=${data.id})`;
      swarm.loggerService.warn(message);
      console.warn(message);
      this._data = null;
      this._when = 0;
      return;
    }
    if (data) {
      this._data = data.data;
      this._when = data.when;
      return;
    }
    this._data = null;
    this._when = 0;
  });

  /**
   * Read the current persisted session value.
   * Returns null if the stored `when` is greater than the requested `when`
   * (look-ahead bias protection).
   * @param when - Logical timestamp at which the read is happening
   * @returns Current session value, or null
   */
  public getData = async <Value extends object = object>(when: Date): Promise<Value | null> => {
    swarm.loggerService.debug(SESSION_PERSIST_INSTANCE_METHOD_NAME_GET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
    if (this._when > when.getTime()) {
      return null;
    }
    return <Value>this._data;
  };

  /**
   * Update session value and persist to disk atomically.
   * A write with a smaller `when` overwrites an existing record — that lets
   * a restarted backtest reset live-written state without breaking live.
   * @param value - New value or null to clear
   * @param when - Logical timestamp this value belongs to
   */
  public setData = async <Value extends object = object>(value: Value | null, when: Date): Promise<void> => {
    swarm.loggerService.debug(SESSION_PERSIST_INSTANCE_METHOD_NAME_SET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
    this._data = value;
    this._when = when.getTime();
    const id = CREATE_KEY_FN(this.symbol, this.strategyName, this.exchangeName, this.frameName, this.backtest);
    await PersistSessionAdapter.writeSessionData(
      { id, data: value, when: this._when },
      this.strategyName,
      this.exchangeName,
      this.frameName,
      when,
      this.symbol,
      this.backtest,
    );
  };

  /** Releases resources held by this instance. */
  public async dispose(): Promise<void> {
    swarm.loggerService.debug(SESSION_LIVE_ADAPTER_METHOD_NAME_DISPOSE, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
    await PersistSessionAdapter.dispose(this.strategyName, this.exchangeName, this.frameName, this.symbol, this.backtest);
  }
}

/**
 * Backtest session adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable session instance implementations
 * - Default backend: SessionLocalInstance (in-memory, no disk persistence)
 * - Alternative backends: SessionPersistInstance, SessionDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useSessionAdapter()
 * - Memoized instances per (symbol, strategyName, exchangeName, frameName) tuple
 */
export class SessionBacktestAdapter implements TSessionAdapter {
  private SessionFactory: TSessionInstanceCtor = SessionLocalInstance;

  private getInstance = memoize(
    ([symbol, strategyName, exchangeName, frameName, backtest]) =>
      CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): ISessionInstance =>
      Reflect.construct(this.SessionFactory, [symbol, strategyName, exchangeName, frameName, backtest]),
  );

  /**
   * Read the current session value for a backtest run.
   * @param symbol - Trading pair symbol
   * @param context.strategyName - Strategy identifier
   * @param context.exchangeName - Exchange identifier
   * @param context.frameName - Frame identifier
   * @param when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Current session value, or null if not set / look-ahead
   */
  public getData = async <Value extends object = object>(symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }, when: Date): Promise<Value | null> => {
    swarm.loggerService.debug(SESSION_BACKTEST_ADAPTER_METHOD_NAME_GET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
    });
    const key = CREATE_KEY_FN(symbol, context.strategyName, context.exchangeName, context.frameName, true);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(symbol, context.strategyName, context.exchangeName, context.frameName, true);
    await instance.waitForInit(isInitial);
    return await instance.getData<Value>(when);
  };

  /**
   * Update the session value for a backtest run.
   * @param symbol - Trading pair symbol
   * @param value - New value or null to clear
   * @param context.strategyName - Strategy identifier
   * @param context.exchangeName - Exchange identifier
   * @param context.frameName - Frame identifier
   * @param when - Logical timestamp this value belongs to
   */
  public setData = async <Value extends object = object>(symbol: string, value: Value | null, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }, when: Date): Promise<void> => {
    swarm.loggerService.debug(SESSION_BACKTEST_ADAPTER_METHOD_NAME_SET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
    });
    const key = CREATE_KEY_FN(symbol, context.strategyName, context.exchangeName, context.frameName, true);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(symbol, context.strategyName, context.exchangeName, context.frameName, true);
    await instance.waitForInit(isInitial);
    return await instance.setData<Value>(value, when);
  };

  /**
   * Switches to in-memory adapter (default).
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.SessionFactory = SessionLocalInstance;
  };

  /**
   * Switches to file-system backed adapter.
   * Data is persisted to disk via PersistSessionAdapter.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.SessionFactory = SessionPersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.SessionFactory = SessionDummyInstance;
  };

  /**
   * Switches to a custom session adapter implementation.
   * @param Ctor - Constructor for the custom session instance
   */
  public useSessionAdapter = (Ctor: TSessionInstanceCtor): void => {
    swarm.loggerService.info(SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_SESSION_ADAPTER);
    this.SessionFactory = Ctor;
  };

  /**
   * Clears the memoized instance cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new instances are created with the updated base path.
   */
  public clear = (): void => {
    swarm.loggerService.info(SESSION_BACKTEST_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

/**
 * Live trading session adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable session instance implementations
 * - Default backend: SessionPersistInstance (file-system backed, survives restarts)
 * - Alternative backends: SessionLocalInstance, SessionDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useSessionAdapter()
 * - Memoized instances per (symbol, strategyName, exchangeName, frameName) tuple
 */
export class SessionLiveAdapter implements TSessionAdapter {
  private SessionFactory: TSessionInstanceCtor = SessionPersistInstance;

  private getInstance = memoize(
    ([symbol, strategyName, exchangeName, frameName, backtest]) =>
      CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): ISessionInstance =>
      Reflect.construct(this.SessionFactory, [symbol, strategyName, exchangeName, frameName, backtest]),
  );

  /**
   * Read the current session value for a live run.
   * @param symbol - Trading pair symbol
   * @param context.strategyName - Strategy identifier
   * @param context.exchangeName - Exchange identifier
   * @param context.frameName - Frame identifier
   * @param when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Current session value, or null if not set / look-ahead
   */
  public getData = async <Value extends object = object>(symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }, when: Date): Promise<Value | null> => {
    swarm.loggerService.debug(SESSION_LIVE_ADAPTER_METHOD_NAME_GET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
    });
    const key = CREATE_KEY_FN(symbol, context.strategyName, context.exchangeName, context.frameName, false);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(symbol, context.strategyName, context.exchangeName, context.frameName, false);
    await instance.waitForInit(isInitial);
    return await instance.getData<Value>(when);
  };

  /**
   * Update the session value for a live run.
   * @param symbol - Trading pair symbol
   * @param value - New value or null to clear
   * @param context.strategyName - Strategy identifier
   * @param context.exchangeName - Exchange identifier
   * @param context.frameName - Frame identifier
   * @param when - Logical timestamp this value belongs to
   */
  public setData = async <Value extends object = object>(symbol: string, value: Value | null, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }, when: Date): Promise<void> => {
    swarm.loggerService.debug(SESSION_LIVE_ADAPTER_METHOD_NAME_SET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
    });
    const key = CREATE_KEY_FN(symbol, context.strategyName, context.exchangeName, context.frameName, false);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(symbol, context.strategyName, context.exchangeName, context.frameName, false);
    await instance.waitForInit(isInitial);
    return await instance.setData<Value>(value, when);
  };

  /**
   * Switches to in-memory adapter.
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(SESSION_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.SessionFactory = SessionLocalInstance;
  };

  /**
   * Switches to file-system backed adapter (default).
   * Data is persisted to disk via PersistSessionAdapter.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(SESSION_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.SessionFactory = SessionPersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(SESSION_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.SessionFactory = SessionDummyInstance;
  };

  /**
   * Switches to a custom session adapter implementation.
   * @param Ctor - Constructor for the custom session instance
   */
  public useSessionAdapter = (Ctor: TSessionInstanceCtor): void => {
    swarm.loggerService.info(SESSION_LIVE_ADAPTER_METHOD_NAME_USE_SESSION_ADAPTER);
    this.SessionFactory = Ctor;
  };

  /**
   * Clears the memoized instance cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new instances are created with the updated base path.
   */
  public clear = (): void => {
    swarm.loggerService.info(SESSION_LIVE_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

/**
 * Main session adapter that manages both backtest and live session storage.
 *
 * Features:
 * - Routes all operations to SessionBacktest or SessionLive based on the backtest flag
 */
export class SessionAdapter {
  /**
   * Read the current session value for a signal.
   * Routes to SessionBacktest or SessionLive based on backtest.
   * @param symbol - Trading pair symbol
   * @param context.strategyName - Strategy identifier
   * @param context.exchangeName - Exchange identifier
   * @param context.frameName - Frame identifier
   * @param backtest - Flag indicating if the context is backtest or live
   * @param when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Current session value, or null if not set / look-ahead
   */
  public getData = async <Value extends object = object>(symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }, backtest: boolean, when: Date): Promise<Value | null> => {
    swarm.loggerService.debug(SESSION_ADAPTER_METHOD_NAME_GET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest,
    });
    if (backtest) {
      return await SessionBacktest.getData<Value>(symbol, context, when);
    }
    return await SessionLive.getData<Value>(symbol, context, when);
  };

  /**
   * Update the session value for a signal.
   * Routes to SessionBacktest or SessionLive based on backtest.
   * @param symbol - Trading pair symbol
   * @param value - New value or null to clear
   * @param context.strategyName - Strategy identifier
   * @param context.exchangeName - Exchange identifier
   * @param context.frameName - Frame identifier
   * @param backtest - Flag indicating if the context is backtest or live
   * @param when - Logical timestamp this value belongs to
   */
  public setData = async <Value extends object = object>(symbol: string, value: Value | null, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }, backtest: boolean, when: Date): Promise<void> => {
    swarm.loggerService.debug(SESSION_ADAPTER_METHOD_NAME_SET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest,
    });
    if (backtest) {
      return await SessionBacktest.setData<Value>(symbol, value, context, when);
    }
    return await SessionLive.setData<Value>(symbol, value, context, when);
  };
}

/**
 * Global singleton instance of SessionAdapter.
 * Provides unified session management for backtest and live trading.
 */
export const Session = new SessionAdapter();

/**
 * Global singleton instance of SessionLiveAdapter.
 * Provides live trading session storage with pluggable backends.
 */
export const SessionLive = new SessionLiveAdapter();

/**
 * Global singleton instance of SessionBacktestAdapter.
 * Provides backtest session storage with pluggable backends.
 */
export const SessionBacktest = new SessionBacktestAdapter();
