import { compose, singleshot } from "functools-kit";
import { signalBacktestEmitter, signalLiveEmitter } from "../config/emitters";
import {
  IStorageSignalRow,
  IStrategyTickResultCancelled,
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  IStrategyTickResultScheduled,
} from "../interfaces/Strategy.interface";
import { PersistStorageAdapter } from "./Persist";
import backtest from "../lib";

const MAX_SIGNALS = 25;

const STORAGE_BACKTEST_METHOD_NAME_WAIT_FOR_INIT = "StorageBacktestUtils.waitForInit";
const STORAGE_BACKTEST_METHOD_NAME_UPDATE_STORAGE = "StorageBacktestUtils._updateStorage";
const STORAGE_BACKTEST_METHOD_NAME_HANDLE_OPENED = "StorageBacktestUtils.handleOpened";
const STORAGE_BACKTEST_METHOD_NAME_HANDLE_CLOSED = "StorageBacktestUtils.handleClosed";
const STORAGE_BACKTEST_METHOD_NAME_HANDLE_SCHEDULED = "StorageBacktestUtils.handleScheduled";
const STORAGE_BACKTEST_METHOD_NAME_HANDLE_CANCELLED = "StorageBacktestUtils.handleCancelled";
const STORAGE_BACKTEST_METHOD_NAME_FIND_BY_ID = "StorageBacktestUtils.findById";
const STORAGE_BACKTEST_METHOD_NAME_LIST = "StorageBacktestUtils.list";

const STORAGE_LIVE_METHOD_NAME_WAIT_FOR_INIT = "StorageLiveUtils.waitForInit";
const STORAGE_LIVE_METHOD_NAME_UPDATE_STORAGE = "StorageLiveUtils._updateStorage";
const STORAGE_LIVE_METHOD_NAME_HANDLE_OPENED = "StorageLiveUtils.handleOpened";
const STORAGE_LIVE_METHOD_NAME_HANDLE_CLOSED = "StorageLiveUtils.handleClosed";
const STORAGE_LIVE_METHOD_NAME_HANDLE_SCHEDULED = "StorageLiveUtils.handleScheduled";
const STORAGE_LIVE_METHOD_NAME_HANDLE_CANCELLED = "StorageLiveUtils.handleCancelled";
const STORAGE_LIVE_METHOD_NAME_FIND_BY_ID = "StorageLiveUtils.findById";
const STORAGE_LIVE_METHOD_NAME_LIST = "StorageLiveUtils.list";

const STORAGE_ADAPTER_METHOD_NAME_ENABLE = "StorageAdapter.enable";
const STORAGE_ADAPTER_METHOD_NAME_DISABLE = "StorageAdapter.disable";
const STORAGE_ADAPTER_METHOD_NAME_FIND_SIGNAL_BY_ID = "StorageAdapter.findSignalById";
const STORAGE_ADAPTER_METHOD_NAME_LIST_SIGNAL_BACKTEST = "StorageAdapter.listSignalBacktest";
const STORAGE_ADAPTER_METHOD_NAME_LIST_SIGNAL_LIVE = "StorageAdapter.listSignalLive";

type StorageId = IStorageSignalRow["id"];

/**
 * Utility class for managing backtest signal history.
 *
 * Stores trading signal history for admin dashboard display during backtesting
 * with automatic initialization, deduplication, and storage limits.
 *
 * @example
 * ```typescript
 * import { StorageBacktestUtils } from "./classes/Storage";
 *
 * const storage = new StorageBacktestUtils();
 *
 * // Handle signal events
 * await storage.handleOpened(tickResult);
 * await storage.handleClosed(tickResult);
 *
 * // Query signals
 * const signal = await storage.findById("signal-123");
 * const allSignals = await storage.list();
 * ```
 */
export class StorageBacktestUtils {
  private _signals: Map<StorageId, IStorageSignalRow>;

  /**
   * Initializes storage by loading existing signal history from persist layer.
   * Uses singleshot to ensure initialization happens only once.
   */
  private waitForInit = singleshot(async () => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_WAIT_FOR_INIT);
    const signalList = await PersistStorageAdapter.readStorageData(true);
    signalList.sort((a, b) => a.priority - b.priority);
    this._signals = new Map(
      signalList
        .slice(-MAX_SIGNALS)
        .map((signal) => [signal.id, signal]),
    );
  });

  /**
   * Persists current signal history to storage.
   * Sorts by priority and limits to MAX_SIGNALS entries.
   *
   * @throws Error if storage not initialized
   */
  private async _updateStorage(): Promise<void> {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_UPDATE_STORAGE);
    if (!this._signals) {
      throw new Error(
        "StorageBacktestUtils not initialized. Call waitForInit first.",
      );
    }
    const signalList = Array.from(this._signals.values());
    signalList.sort((a, b) => a.priority - b.priority);
    await PersistStorageAdapter.writeStorageData(
      signalList.slice(-MAX_SIGNALS),
      true,
    );
  }

  /**
   * Handles signal opened event.
   *
   * @param tick - Tick result containing opened signal data
   * @returns Promise resolving when storage is updated
   */
  public handleOpened = async (tick: IStrategyTickResultOpened) => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_HANDLE_OPENED, {
      signalId: tick.signal.id,
    });
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.updatedAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "opened",
      priority: Date.now(),
      createdAt: lastStorage ? lastStorage.createdAt : tick.createdAt,
      updatedAt: tick.createdAt,
    });
    await this._updateStorage();
  };

  /**
   * Handles signal closed event.
   *
   * @param tick - Tick result containing closed signal data
   * @returns Promise resolving when storage is updated
   */
  public handleClosed = async (tick: IStrategyTickResultClosed) => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_HANDLE_CLOSED, {
      signalId: tick.signal.id,
    });
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.updatedAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "closed",
      priority: Date.now(),
      pnl: tick.pnl,
      createdAt: lastStorage ? lastStorage.createdAt : tick.createdAt,
      updatedAt: tick.createdAt,
    });
    await this._updateStorage();
  };

  /**
   * Handles signal scheduled event.
   *
   * @param tick - Tick result containing scheduled signal data
   * @returns Promise resolving when storage is updated
   */
  public handleScheduled = async (tick: IStrategyTickResultScheduled) => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_HANDLE_SCHEDULED, {
      signalId: tick.signal.id,
    });
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.updatedAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "scheduled",
      priority: Date.now(),
      createdAt: lastStorage ? lastStorage.createdAt : tick.createdAt,
      updatedAt: tick.createdAt,
    });
    await this._updateStorage();
  };

  /**
   * Handles signal cancelled event.
   *
   * @param tick - Tick result containing cancelled signal data
   * @returns Promise resolving when storage is updated
   */
  public handleCancelled = async (tick: IStrategyTickResultCancelled) => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_HANDLE_CANCELLED, {
      signalId: tick.signal.id,
    });
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.updatedAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "cancelled",
      priority: Date.now(),
      createdAt: lastStorage ? lastStorage.createdAt : tick.createdAt,
      updatedAt: tick.createdAt,
    });
    await this._updateStorage();
  };

  /**
   * Finds a signal by its unique identifier.
   *
   * @param id - Signal identifier
   * @returns Promise resolving to signal row or null if not found
   */
  public findById = async (
    id: StorageId,
  ): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_FIND_BY_ID, { id });
    await this.waitForInit();
    return this._signals.get(id) ?? null;
  };

  /**
   * Lists all stored backtest signals.
   *
   * @returns Promise resolving to array of signal rows
   */
  public list = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_LIST);
    await this.waitForInit();
    return Array.from(this._signals.values());
  };
}

/**
 * Utility class for managing live trading signal history.
 *
 * Stores trading signal history for admin dashboard display during live trading
 * with automatic initialization, deduplication, and storage limits.
 *
 * @example
 * ```typescript
 * import { StorageLiveUtils } from "./classes/Storage";
 *
 * const storage = new StorageLiveUtils();
 *
 * // Handle signal events
 * await storage.handleOpened(tickResult);
 * await storage.handleClosed(tickResult);
 *
 * // Query signals
 * const signal = await storage.findById("signal-123");
 * const allSignals = await storage.list();
 * ```
 */
export class StorageLiveUtils {
  private _signals: Map<StorageId, IStorageSignalRow>;

  /**
   * Initializes storage by loading existing signal history from persist layer.
   * Uses singleshot to ensure initialization happens only once.
   */
  private waitForInit = singleshot(async () => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_WAIT_FOR_INIT);
    const signalList = await PersistStorageAdapter.readStorageData(false);
    signalList.sort((a, b) => a.priority - b.priority);
    this._signals = new Map(
      signalList
        .slice(-MAX_SIGNALS)
        .map((signal) => [signal.id, signal]),
    );
  });

  /**
   * Persists current signal history to storage.
   * Sorts by priority and limits to MAX_SIGNALS entries.
   *
   * @throws Error if storage not initialized
   */
  private async _updateStorage(): Promise<void> {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_UPDATE_STORAGE);
    if (!this._signals) {
      throw new Error(
        "StorageLiveUtils not initialized. Call waitForInit first.",
      );
    }
    const signalList = Array.from(this._signals.values());
    signalList.sort((a, b) => a.priority - b.priority);
    await PersistStorageAdapter.writeStorageData(
      signalList.slice(-MAX_SIGNALS),
      false,
    );
  }

  /**
   * Handles signal opened event.
   *
   * @param tick - Tick result containing opened signal data
   * @returns Promise resolving when history is updated
   */
  public handleOpened = async (tick: IStrategyTickResultOpened) => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_HANDLE_OPENED, {
      signalId: tick.signal.id,
    });
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.updatedAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "opened",
      priority: Date.now(),
      createdAt: lastStorage ? lastStorage.createdAt : tick.createdAt,
      updatedAt: tick.createdAt,
    });
    await this._updateStorage();
  };

  /**
   * Handles signal closed event.
   *
   * @param tick - Tick result containing closed signal data
   * @returns Promise resolving when history is updated
   */
  public handleClosed = async (tick: IStrategyTickResultClosed) => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_HANDLE_CLOSED, {
      signalId: tick.signal.id,
    });
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.updatedAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "closed",
      priority: Date.now(),
      createdAt: lastStorage ? lastStorage.createdAt : tick.createdAt,
      updatedAt: tick.createdAt,
    });
    await this._updateStorage();
  };

  /**
   * Handles signal scheduled event.
   *
   * @param tick - Tick result containing scheduled signal data
   * @returns Promise resolving when history is updated
   */
  public handleScheduled = async (tick: IStrategyTickResultScheduled) => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_HANDLE_SCHEDULED, {
      signalId: tick.signal.id,
    });
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.updatedAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "scheduled",
      priority: Date.now(),
      createdAt: lastStorage ? lastStorage.createdAt : tick.createdAt,
      updatedAt: tick.createdAt,
    });
    await this._updateStorage();
  };

  /**
   * Handles signal cancelled event.
   *
   * @param tick - Tick result containing cancelled signal data
   * @returns Promise resolving when history is updated
   */
  public handleCancelled = async (tick: IStrategyTickResultCancelled) => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_HANDLE_CANCELLED, {
      signalId: tick.signal.id,
    });
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.updatedAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "cancelled",
      priority: Date.now(),
      createdAt: lastStorage ? lastStorage.createdAt : tick.createdAt,
      updatedAt: tick.createdAt,
    });
    await this._updateStorage();
  };

  /**
   * Finds a signal by its unique identifier.
   *
   * @param id - Signal identifier
   * @returns Promise resolving to signal row or null if not found
   */
  public findById = async (
    id: StorageId,
  ): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_FIND_BY_ID, { id });
    await this.waitForInit();
    return this._signals.get(id) ?? null;
  };

  /**
   * Lists all stored live signals.
   *
   * @returns Promise resolving to array of signal rows
   */
  public list = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_LIST);
    await this.waitForInit();
    return Array.from(this._signals.values());
  };
}

/**
 * Main storage adapter for signal history management.
 *
 * Provides unified interface for accessing backtest and live signal history
 * for admin dashboard. Subscribes to signal emitters and automatically
 * updates history on signal events.
 *
 * @example
 * ```typescript
 * import { Storage } from "./classes/Storage";
 *
 * // Enable signal history tracking
 * const unsubscribe = Storage.enable();
 *
 * // Query signals
 * const backtestSignals = await Storage.listSignalBacktest();
 * const liveSignals = await Storage.listSignalLive();
 * const signal = await Storage.findSignalById("signal-123");
 *
 * // Disable tracking
 * Storage.disable();
 * ```
 */
export class StorageAdapter {
  _signalLiveUtils = new StorageLiveUtils();
  _signalBacktestUtils = new StorageBacktestUtils();

  /**
   * Enables signal history tracking by subscribing to emitters.
   *
   * @returns Cleanup function to unsubscribe from all emitters
   */
  public enable = singleshot(() => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_ENABLE);
    let unLive: Function;
    let unBacktest: Function;

    {
      const unBacktestOpen = signalBacktestEmitter
        .filter(({ action }) => action === "opened")
        .connect((tick: IStrategyTickResultOpened) =>
          this._signalBacktestUtils.handleOpened(tick),
        );

      const unBacktestClose = signalBacktestEmitter
        .filter(({ action }) => action === "closed")
        .connect((tick: IStrategyTickResultClosed) =>
          this._signalBacktestUtils.handleClosed(tick),
        );

      const unBacktestScheduled = signalBacktestEmitter
        .filter(({ action }) => action === "scheduled")
        .connect((tick: IStrategyTickResultScheduled) =>
          this._signalBacktestUtils.handleScheduled(tick),
        );

      const unBacktestCancelled = signalBacktestEmitter
        .filter(({ action }) => action === "cancelled")
        .connect((tick: IStrategyTickResultCancelled) =>
          this._signalBacktestUtils.handleCancelled(tick),
        );

      unBacktest = compose(
        () => unBacktestOpen(),
        () => unBacktestClose(),
        () => unBacktestScheduled(),
        () => unBacktestCancelled(),
      );
    }

    {
      const unLiveOpen = signalLiveEmitter
        .filter(({ action }) => action === "opened")
        .connect((tick: IStrategyTickResultOpened) =>
          this._signalLiveUtils.handleOpened(tick),
        );

      const unLiveClose = signalLiveEmitter
        .filter(({ action }) => action === "closed")
        .connect((tick: IStrategyTickResultClosed) =>
          this._signalLiveUtils.handleClosed(tick),
        );

      const unLiveScheduled = signalLiveEmitter
        .filter(({ action }) => action === "scheduled")
        .connect((tick: IStrategyTickResultScheduled) =>
          this._signalLiveUtils.handleScheduled(tick),
        );

      const unLiveCancelled = signalLiveEmitter
        .filter(({ action }) => action === "cancelled")
        .connect((tick: IStrategyTickResultCancelled) =>
          this._signalLiveUtils.handleCancelled(tick),
        );

      unLive = compose(
        () => unLiveOpen(),
        () => unLiveClose(),
        () => unLiveScheduled(),
        () => unLiveCancelled(),
      );
    }

    return () => {
      unLive();
      unBacktest();
      this.enable.clear();
    };
  });

  /**
   * Disables signal history tracking by unsubscribing from emitters.
   */
  public disable = () => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_DISABLE);
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  /**
   * Finds a signal by ID across both backtest and live history.
   *
   * @param id - Signal identifier
   * @returns Promise resolving to signal row
   * @throws Error if signal not found in either storage
   */
  public findSignalById = async (
    id: StorageId,
  ): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_FIND_SIGNAL_BY_ID, { id });
    if (!this.enable.hasValue()) {
      throw new Error("StorageAdapter is not enabled. Call enable() first.");
    }
    let result: IStorageSignalRow | null = null;
    if ((result = await this._signalBacktestUtils.findById(id))) {
      return result;
    }
    if ((result = await this._signalLiveUtils.findById(id))) {
      return result;
    }
    throw new Error(`Storage signal with id ${id} not found`);
  };

  /**
   * Lists all backtest signal history.
   *
   * @returns Promise resolving to array of backtest signal rows
   */
  public listSignalBacktest = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_LIST_SIGNAL_BACKTEST);
    if (!this.enable.hasValue()) {
      throw new Error("StorageAdapter is not enabled. Call enable() first.");
    }
    return await this._signalBacktestUtils.list();
  };

  /**
   * Lists all live signal history.
   *
   * @returns Promise resolving to array of live signal rows
   */
  public listSignalLive = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_LIST_SIGNAL_LIVE);
    if (!this.enable.hasValue()) {
      throw new Error("StorageAdapter is not enabled. Call enable() first.");
    }
    return await this._signalLiveUtils.list();
  };
}

export const Storage = new StorageAdapter();
