import { compose, memoize, queued, singleshot } from "functools-kit";
import { signalEmitter } from "../config/emitters";
import { PersistStateAdapter } from "./Persist";
import swarm from "../lib";

const CREATE_KEY_FN = (signalId: string, bucketName: string) =>
  `${signalId}_${bucketName}`;

/** Updater function for setState — receives current value and returns the next value. */
export type Dispatch<Value extends object = object> = (value: Value) => Value | Promise<Value>;

/** Logical namespace for grouping state buckets within a signal, e.g. "trade" or "metrics". */
export type BucketName = string;

const STATE_LOCAL_INSTANCE_METHOD_NAME_GET = "StateLocalInstance.getState";
const STATE_LOCAL_INSTANCE_METHOD_NAME_SET = "StateLocalInstance.setState";

const STATE_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT = "StatePersistInstance.waitForInit";
const STATE_PERSIST_INSTANCE_METHOD_NAME_GET = "StatePersistInstance.getState";
const STATE_PERSIST_INSTANCE_METHOD_NAME_SET = "StatePersistInstance.setState";

const STATE_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE = "StateBacktestAdapter.dispose";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_GET = "StateBacktestAdapter.getState";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_SET = "StateBacktestAdapter.setState";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL = "StateBacktestAdapter.useLocal";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST = "StateBacktestAdapter.usePersist";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY = "StateBacktestAdapter.useDummy";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_STATE_ADAPTER = "StateBacktestAdapter.useStateAdapter";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_CLEAR = "StateBacktestAdapter.clear";

const STATE_LIVE_ADAPTER_METHOD_NAME_DISPOSE = "StateLiveAdapter.dispose";
const STATE_LIVE_ADAPTER_METHOD_NAME_GET = "StateLiveAdapter.getState";
const STATE_LIVE_ADAPTER_METHOD_NAME_SET = "StateLiveAdapter.setState";
const STATE_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL = "StateLiveAdapter.useLocal";
const STATE_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST = "StateLiveAdapter.usePersist";
const STATE_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY = "StateLiveAdapter.useDummy";
const STATE_LIVE_ADAPTER_METHOD_NAME_USE_STATE_ADAPTER = "StateLiveAdapter.useStateAdapter";
const STATE_LIVE_ADAPTER_METHOD_NAME_CLEAR = "StateLiveAdapter.clear";

const STATE_ADAPTER_METHOD_NAME_ENABLE = "StateAdapter.enable";
const STATE_ADAPTER_METHOD_NAME_DISABLE = "StateAdapter.disable";
const STATE_ADAPTER_METHOD_NAME_GET = "StateAdapter.getState";
const STATE_ADAPTER_METHOD_NAME_SET = "StateAdapter.setState";

/**
 * Interface for state instance implementations.
 * Defines the contract for local, persist, and dummy backends.
 *
 * Intended use: per-signal mutable state for LLM-driven strategies that track
 * trade confirmation metrics across the position lifetime — e.g. peak unrealised PnL,
 * minutes since entry, and capitulation thresholds.
 *
 * Example shape:
 * ```ts
 * { peakPercent: number; minutesOpen: number }
 * ```
 * Profitable trades endure -0.5–2.5% drawdown yet still reach peak 2–3%+.
 * SL trades either never go positive (Feb25) or show peak < 0.15% (Feb08, Feb13).
 * Capitulation rule: if position open N minutes and peak < threshold (e.g. 0.3%) —
 * LLM thesis was not confirmed by market, exit immediately.
 */
export interface IStateInstance {
  /**
   * Initialize the state instance.
   * @param initial - Whether this is the first initialization
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read the current state value.
   * @returns Current state value
   */
  getState<Value extends object = object>(): Promise<Value>;

  /**
   * Update the state value.
   * @param dispatch - New value or updater function receiving current value
   * @returns Updated state value
   */
  setState<Value extends object = object>(dispatch: Value | Dispatch<Value>): Promise<Value>;

  /**
   * Releases any resources held by this instance.
   */
  dispose(): Promise<void>;
}

/**
 * Constructor type for state instance implementations.
 * Used for swapping backends via StateBacktestAdapter / StateLiveAdapter.
 */
export type TStateInstanceCtor = new (initialValue: object, signalId: string, bucketName: string) => IStateInstance;

/**
 * Public surface of StateBacktestAdapter / StateLiveAdapter — IStateInstance minus waitForInit and dispose.
 * waitForInit and dispose are managed internally by the adapter.
 */
type TStateAdapter = {
  [key in Exclude<keyof IStateInstance, "waitForInit" | "dispose">]: any;
}

/**
 * In-process state instance backed by a plain object reference.
 * All data lives in process memory only - no disk persistence.
 *
 * Features:
 * - Mutable in-memory state with functional dispatch support
 * - Scoped per (signalId, bucketName) pair
 *
 * Use for backtesting and unit tests where persistence between runs is not needed.
 * Tracks per-trade metrics such as peakPercent and minutesOpen to implement
 * the capitulation rule: exit when peak < threshold after N minutes open.
 */
export class StateLocalInstance implements IStateInstance {

  _value: object;

  constructor(
    readonly initialValue: object,
    readonly signalId: string,
    readonly bucketName: string,
  ) { }

  /**
   * Initializes _value from initialValue - local state needs no async setup.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    this._value = this.initialValue;
  });

  /**
   * Read the current in-memory state value.
   * @returns Current state value
   */
  public async getState<Value extends object = object>(): Promise<Value> {
    swarm.loggerService.debug(STATE_LOCAL_INSTANCE_METHOD_NAME_GET, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    return <Value>this._value;
  }

  /**
   * Update the in-memory state value.
   * @param dispatch - New value or updater function receiving current value
   * @returns Updated state value
   */
  public setState = queued(async <Value extends object = object>(dispatch: Value | Dispatch<Value>): Promise<Value> => {
    swarm.loggerService.debug(STATE_LOCAL_INSTANCE_METHOD_NAME_SET, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    if (typeof dispatch === "function") {
      this._value = await dispatch(<Value>this._value);
    } else {
      this._value = dispatch;
    }
    return <Value>this._value;
  });

  /** Releases resources held by this instance. */
  public async dispose(): Promise<void> {
    swarm.loggerService.debug(STATE_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
  }
}

/**
 * No-op state instance that discards all writes.
 * Used for disabling state in tests or dry-run scenarios.
 *
 * Useful when replaying historical candles without needing to accumulate
 * peakPercent/minutesOpen — the capitulation rule is simply never triggered.
 */
export class StateDummyInstance implements IStateInstance {
  constructor(
    readonly initialValue: object,
    readonly signalId: string,
    readonly bucketName: string,
  ) { }

  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    void 0;
  });

  /**
   * No-op read - always returns initialValue.
   * @returns initialValue
   */
  public async getState<Value extends object = object>(): Promise<Value> {
    return <Value>this.initialValue;
  }

  /**
   * No-op write - discards the value and returns initialValue.
   * @returns initialValue
   */
  public async setState<Value extends object = object>(_dispatch: Value | Dispatch<Value>): Promise<Value> {
    return <Value>this.initialValue;
  }

  /** No-op. */
  public async dispose(): Promise<void> {
    void 0;
  }
}

/**
 * File-system backed state instance.
 * Data is persisted atomically to disk via PersistStateAdapter.
 * State is restored from disk on waitForInit.
 *
 * Features:
 * - Crash-safe atomic file writes
 * - Functional dispatch support
 * - Scoped per (signalId, bucketName) pair
 *
 * Use in live trading to survive process restarts mid-trade.
 * Preserves peakPercent and minutesOpen so the capitulation rule
 * (exit if peak < threshold after N minutes) continues correctly after a crash.
 */
export class StatePersistInstance implements IStateInstance {

  _value: object;

  constructor(
    readonly initialValue: object,
    readonly signalId: string,
    readonly bucketName: string,
  ) { }

  /**
   * Initialize persistence storage and restore state from disk.
   * @param initial - Whether this is the first initialization
   */
  public waitForInit = singleshot(async (initial: boolean) => {
    swarm.loggerService.debug(STATE_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      initial,
    });
    await PersistStateAdapter.waitForInit(this.signalId, this.bucketName, initial);
    const data = await PersistStateAdapter.readStateData(this.signalId, this.bucketName);
    if (data) {
      this._value = data.data;
      return;
    }
    this._value = this.initialValue;
  });

  /**
   * Read the current persisted state value.
   * @returns Current state value
   */
  public async getState<Value extends object = object>(): Promise<Value> {
    swarm.loggerService.debug(STATE_PERSIST_INSTANCE_METHOD_NAME_GET, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    return <Value>this._value;
  }

  /**
   * Update state and persist to disk atomically.
   * @param dispatch - New value or updater function receiving current value
   * @returns Updated state value
   */
  public setState = queued(async <Value extends object = object>(dispatch: Value | Dispatch<Value>): Promise<Value> => {
    swarm.loggerService.debug(STATE_PERSIST_INSTANCE_METHOD_NAME_SET, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    if (typeof dispatch === "function") {
      this._value = await dispatch(<Value>this._value);
    } else {
      this._value = dispatch;
    }
    const id = CREATE_KEY_FN(this.signalId, this.bucketName);
    await PersistStateAdapter.writeStateData(
      { id, data: this._value },
      this.signalId,
      this.bucketName,
    );
    return <Value>this._value;
  })

  /** Releases resources held by this instance. */
  public async dispose(): Promise<void> {
    swarm.loggerService.debug(STATE_LIVE_ADAPTER_METHOD_NAME_DISPOSE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    await PersistStateAdapter.dispose(this.signalId, this.bucketName);
  }
}

/**
 * Backtest state adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable state instance implementations
 * - Default backend: StateLocalInstance (in-memory, no disk persistence)
 * - Alternative backends: StatePersistInstance, StateDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useStateAdapter()
 * - Memoized instances per (signalId, bucketName) pair; cleared via disposeSignal() from StateAdapter
 *
 * Primary use case — LLM-driven capitulation rule:
 * Profitable trades endure -0.5–2.5% drawdown and still reach peak 2–3%+.
 * SL trades never go positive (Feb25) or show peak < 0.15% (Feb08, Feb13).
 * Rule: if position open >= N minutes and peakPercent < threshold (e.g. 0.3%),
 * the LLM thesis was not confirmed by market — exit immediately.
 * State tracks `{ peakPercent, minutesOpen }` per signal across onActivePing ticks.
 */
export class StateBacktestAdapter implements TStateAdapter {
  private StateFactory: TStateInstanceCtor = StateLocalInstance;

  private getInstance = memoize(
    ([signalId, bucketName]) => CREATE_KEY_FN(signalId, bucketName),
    (signalId: string, bucketName: BucketName, initialValue: object): IStateInstance =>
      Reflect.construct(this.StateFactory, [initialValue, signalId, bucketName]),
  );

  /**
   * Disposes all memoized instances for the given signalId.
   * Called by StateAdapter when a signal is cancelled or closed.
   * @param signalId - Signal identifier to dispose
   */
  public disposeSignal = (signalId: string): void => {
    const prefix = CREATE_KEY_FN(signalId, "");
    for (const key of this.getInstance.keys()) {
      if (key.startsWith(prefix)) {
        const instance = this.getInstance.get(key);
        instance && instance.dispose();
        this.getInstance.clear(key);
      }
    }
  };

  /**
   * Read the current state value for a signal.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.initialValue - Default value when no persisted state exists
   * @returns Current state value
   */
  public getState = async <Value extends object = object>(dto: { signalId: string, bucketName: BucketName, initialValue: object }): Promise<Value> => {
    swarm.loggerService.debug(STATE_BACKTEST_ADAPTER_METHOD_NAME_GET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName, dto.initialValue);
    await instance.waitForInit(isInitial);
    return await instance.getState();
  };

  /**
   * Update the state value for a signal.
   * @param dispatch - New value or updater function receiving current value
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.initialValue - Default value when no persisted state exists
   * @returns Updated state value
   */
  public setState = async <Value extends object = object>(dispatch: Value | Dispatch<Value>, dto: { signalId: string, bucketName: BucketName, initialValue: object }): Promise<Value> => {
    swarm.loggerService.debug(STATE_BACKTEST_ADAPTER_METHOD_NAME_SET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName, dto.initialValue);
    await instance.waitForInit(isInitial);
    return await instance.setState(dispatch);
  };

  /**
   * Switches to in-memory adapter (default).
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.StateFactory = StateLocalInstance;
  };

  /**
   * Switches to file-system backed adapter.
   * Data is persisted to disk via PersistStateAdapter.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.StateFactory = StatePersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.StateFactory = StateDummyInstance;
  };

  /**
   * Switches to a custom state adapter implementation.
   * @param Ctor - Constructor for the custom state instance
   */
  public useStateAdapter = (Ctor: TStateInstanceCtor): void => {
    swarm.loggerService.info(STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_STATE_ADAPTER);
    this.StateFactory = Ctor;
  };

  /**
   * Clears the memoized instance cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new instances are created with the updated base path.
   */
  public clear = (): void => {
    swarm.loggerService.info(STATE_BACKTEST_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

/**
 * Live trading state adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable state instance implementations
 * - Default backend: StatePersistInstance (file-system backed, survives restarts)
 * - Alternative backends: StateLocalInstance, StateDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useStateAdapter()
 * - Memoized instances per (signalId, bucketName) pair; cleared via disposeSignal() from StateAdapter
 *
 * Primary use case — LLM-driven capitulation rule:
 * Profitable trades endure -0.5–2.5% drawdown and still reach peak 2–3%+.
 * SL trades never go positive (Feb25) or show peak < 0.15% (Feb08, Feb13).
 * Rule: if position open >= N minutes and peakPercent < threshold (e.g. 0.3%),
 * the LLM thesis was not confirmed by market — exit immediately.
 * State persists `{ peakPercent, minutesOpen }` per signal across process restarts.
 */
export class StateLiveAdapter implements TStateAdapter {
  private StateFactory: TStateInstanceCtor = StatePersistInstance;

  private getInstance = memoize(
    ([signalId, bucketName]) => CREATE_KEY_FN(signalId, bucketName),
    (signalId: string, bucketName: BucketName, initialValue: object): IStateInstance =>
      Reflect.construct(this.StateFactory, [initialValue, signalId, bucketName]),
  );

  /**
   * Disposes all memoized instances for the given signalId.
   * Called by StateAdapter when a signal is cancelled or closed.
   * @param signalId - Signal identifier to dispose
   */
  public disposeSignal = (signalId: string): void => {
    const prefix = CREATE_KEY_FN(signalId, "");
    for (const key of this.getInstance.keys()) {
      if (key.startsWith(prefix)) {
        const instance = this.getInstance.get(key);
        instance && instance.dispose();
        this.getInstance.clear(key);
      }
    }
  };

  /**
   * Read the current state value for a signal.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.initialValue - Default value when no persisted state exists
   * @returns Current state value
   */
  public getState = async <Value extends object = object>(dto: { signalId: string, bucketName: BucketName, initialValue: object }): Promise<Value> => {
    swarm.loggerService.debug(STATE_LIVE_ADAPTER_METHOD_NAME_GET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName, dto.initialValue);
    await instance.waitForInit(isInitial);
    return await instance.getState();
  };

  /**
   * Update the state value for a signal.
   * @param dispatch - New value or updater function receiving current value
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.initialValue - Default value when no persisted state exists
   * @returns Updated state value
   */
  public setState = async <Value extends object = object>(dispatch: Value | Dispatch<Value>, dto: { signalId: string, bucketName: BucketName, initialValue: object }): Promise<Value> => {
    swarm.loggerService.debug(STATE_LIVE_ADAPTER_METHOD_NAME_SET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName, dto.initialValue);
    await instance.waitForInit(isInitial);
    return await instance.setState(dispatch);
  };

  /**
   * Switches to in-memory adapter.
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(STATE_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.StateFactory = StateLocalInstance;
  };

  /**
   * Switches to file-system backed adapter (default).
   * Data is persisted to disk via PersistStateAdapter.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(STATE_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.StateFactory = StatePersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(STATE_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.StateFactory = StateDummyInstance;
  };

  /**
   * Switches to a custom state adapter implementation.
   * @param Ctor - Constructor for the custom state instance
   */
  public useStateAdapter = (Ctor: TStateInstanceCtor): void => {
    swarm.loggerService.info(STATE_LIVE_ADAPTER_METHOD_NAME_USE_STATE_ADAPTER);
    this.StateFactory = Ctor;
  };

  /**
   * Clears the memoized instance cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new instances are created with the updated base path.
   */
  public clear = (): void => {
    swarm.loggerService.info(STATE_LIVE_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

/**
 * Main state adapter that manages both backtest and live state storage.
 *
 * Features:
 * - Subscribes to signal lifecycle events (cancelled/closed) to dispose stale instances
 * - Routes all operations to StateBacktest or StateLive based on dto.backtest
 * - Singleshot enable pattern prevents duplicate subscriptions
 * - Cleanup function for proper unsubscription
 */
export class StateAdapter {
  /**
   * Enables state storage by subscribing to signal lifecycle events.
   * Clears memoized instances in StateBacktest and StateLive when a signal
   * is cancelled or closed, preventing stale instances from accumulating.
   * Uses singleshot to ensure one-time subscription.
   *
   * @returns Cleanup function that unsubscribes from all emitters
   */
  public enable = singleshot(() => {
    swarm.loggerService.info(STATE_ADAPTER_METHOD_NAME_ENABLE);

    const unCancel = signalEmitter
      .filter(({ action }) => action === "cancelled")
      .connect(({ signal }) => {
        StateBacktest.disposeSignal(signal.id);
        StateLive.disposeSignal(signal.id);
      });

    const unClose = signalEmitter
      .filter(({ action }) => action === "closed")
      .connect(({ signal }) => {
        StateBacktest.disposeSignal(signal.id);
        StateLive.disposeSignal(signal.id);
      });

    return compose(
      () => unCancel(),
      () => unClose(),
      () => this.enable.clear(),
    );
  });

  /**
   * Disables state storage by unsubscribing from signal lifecycle events.
   * Safe to call multiple times.
   */
  public disable = () => {
    swarm.loggerService.info(STATE_ADAPTER_METHOD_NAME_DISABLE);
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  /**
   * Read the current state value for a signal.
   * Routes to StateBacktest or StateLive based on dto.backtest.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.initialValue - Default value when no persisted state exists
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @returns Current state value
   * @throws Error if adapter is not enabled
   */
  public getState = async <Value extends object = object>(dto: { signalId: string, bucketName: BucketName, initialValue: object, backtest: boolean }): Promise<Value> => {
    if (!this.enable.hasValue()) {
      throw new Error("StateAdapter is not enabled. Call enable() first.");
    }
    swarm.loggerService.debug(STATE_ADAPTER_METHOD_NAME_GET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await StateBacktest.getState<Value>(dto);
    }
    return await StateLive.getState<Value>(dto);
  };

  /**
   * Update the state value for a signal.
   * Routes to StateBacktest or StateLive based on dto.backtest.
   * @param dispatch - New value or updater function receiving current value
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.initialValue - Default value when no persisted state exists
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @returns Updated state value
   * @throws Error if adapter is not enabled
   */
  public setState = async <Value extends object = object>(dispatch: Value | Dispatch<Value>, dto: { signalId: string, bucketName: BucketName, initialValue: object, backtest: boolean }): Promise<Value> => {
    if (!this.enable.hasValue()) {
      throw new Error("StateAdapter is not enabled. Call enable() first.");
    }
    swarm.loggerService.debug(STATE_ADAPTER_METHOD_NAME_SET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await StateBacktest.setState<Value>(dispatch, dto);
    }
    return await StateLive.setState<Value>(dispatch, dto);
  };
}

/**
 * Global singleton instance of StateAdapter.
 * Provides unified state management for backtest and live trading.
 */
export const State = new StateAdapter();

/**
 * Global singleton instance of StateLiveAdapter.
 * Provides live trading state storage with pluggable backends.
 */
export const StateLive = new StateLiveAdapter();

/**
 * Global singleton instance of StateBacktestAdapter.
 * Provides backtest state storage with pluggable backends.
 */
export const StateBacktest = new StateBacktestAdapter();
