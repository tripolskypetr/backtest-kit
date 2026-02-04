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
import { GLOBAL_CONFIG } from "../config/params";

const STORAGE_BACKTEST_METHOD_NAME_WAIT_FOR_INIT = "StoragePersistBacktestUtils.waitForInit";
const STORAGE_BACKTEST_METHOD_NAME_UPDATE_STORAGE = "StoragePersistBacktestUtils._updateStorage";
const STORAGE_BACKTEST_METHOD_NAME_HANDLE_OPENED = "StoragePersistBacktestUtils.handleOpened";
const STORAGE_BACKTEST_METHOD_NAME_HANDLE_CLOSED = "StoragePersistBacktestUtils.handleClosed";
const STORAGE_BACKTEST_METHOD_NAME_HANDLE_SCHEDULED = "StoragePersistBacktestUtils.handleScheduled";
const STORAGE_BACKTEST_METHOD_NAME_HANDLE_CANCELLED = "StoragePersistBacktestUtils.handleCancelled";
const STORAGE_BACKTEST_METHOD_NAME_FIND_BY_ID = "StoragePersistBacktestUtils.findById";
const STORAGE_BACKTEST_METHOD_NAME_LIST = "StoragePersistBacktestUtils.list";

const STORAGE_LIVE_METHOD_NAME_WAIT_FOR_INIT = "StoragePersistLiveUtils.waitForInit";
const STORAGE_LIVE_METHOD_NAME_UPDATE_STORAGE = "StoragePersistLiveUtils._updateStorage";
const STORAGE_LIVE_METHOD_NAME_HANDLE_OPENED = "StoragePersistLiveUtils.handleOpened";
const STORAGE_LIVE_METHOD_NAME_HANDLE_CLOSED = "StoragePersistLiveUtils.handleClosed";
const STORAGE_LIVE_METHOD_NAME_HANDLE_SCHEDULED = "StoragePersistLiveUtils.handleScheduled";
const STORAGE_LIVE_METHOD_NAME_HANDLE_CANCELLED = "StoragePersistLiveUtils.handleCancelled";
const STORAGE_LIVE_METHOD_NAME_FIND_BY_ID = "StoragePersistLiveUtils.findById";
const STORAGE_LIVE_METHOD_NAME_LIST = "StoragePersistLiveUtils.list";

const STORAGE_MEMORY_BACKTEST_METHOD_NAME_HANDLE_OPENED = "StorageMemoryBacktestUtils.handleOpened";
const STORAGE_MEMORY_BACKTEST_METHOD_NAME_HANDLE_CLOSED = "StorageMemoryBacktestUtils.handleClosed";
const STORAGE_MEMORY_BACKTEST_METHOD_NAME_HANDLE_SCHEDULED = "StorageMemoryBacktestUtils.handleScheduled";
const STORAGE_MEMORY_BACKTEST_METHOD_NAME_HANDLE_CANCELLED = "StorageMemoryBacktestUtils.handleCancelled";
const STORAGE_MEMORY_BACKTEST_METHOD_NAME_FIND_BY_ID = "StorageMemoryBacktestUtils.findById";
const STORAGE_MEMORY_BACKTEST_METHOD_NAME_LIST = "StorageMemoryBacktestUtils.list";

const STORAGE_MEMORY_LIVE_METHOD_NAME_HANDLE_OPENED = "StorageMemoryLiveUtils.handleOpened";
const STORAGE_MEMORY_LIVE_METHOD_NAME_HANDLE_CLOSED = "StorageMemoryLiveUtils.handleClosed";
const STORAGE_MEMORY_LIVE_METHOD_NAME_HANDLE_SCHEDULED = "StorageMemoryLiveUtils.handleScheduled";
const STORAGE_MEMORY_LIVE_METHOD_NAME_HANDLE_CANCELLED = "StorageMemoryLiveUtils.handleCancelled";
const STORAGE_MEMORY_LIVE_METHOD_NAME_FIND_BY_ID = "StorageMemoryLiveUtils.findById";
const STORAGE_MEMORY_LIVE_METHOD_NAME_LIST = "StorageMemoryLiveUtils.list";

const STORAGE_ADAPTER_METHOD_NAME_ENABLE = "StorageAdapter.enable";
const STORAGE_ADAPTER_METHOD_NAME_DISABLE = "StorageAdapter.disable";
const STORAGE_ADAPTER_METHOD_NAME_FIND_SIGNAL_BY_ID = "StorageAdapter.findSignalById";
const STORAGE_ADAPTER_METHOD_NAME_LIST_SIGNAL_BACKTEST = "StorageAdapter.listSignalBacktest";
const STORAGE_ADAPTER_METHOD_NAME_LIST_SIGNAL_LIVE = "StorageAdapter.listSignalLive";

const STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_ADAPTER = "StorageBacktestAdapter.useStorageAdapter";
const STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY = "StorageBacktestAdapter.useDummy";
const STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST = "StorageBacktestAdapter.usePersist";
const STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_MEMORY = "StorageBacktestAdapter.useMemory";

const STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER = "StorageLiveAdapter.useStorageAdapter";
const STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY = "StorageLiveAdapter.useDummy";
const STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST = "StorageLiveAdapter.usePersist";
const STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_MEMORY = "StorageLiveAdapter.useMemory";

/**
 * Type alias for signal storage row identifier.
 * Extracted from IStorageSignalRow for type safety and reusability.
 */
type StorageId = IStorageSignalRow["id"];

/**
 * Base interface for storage adapters.
 * All storage adapters must implement this interface.
 */
export interface IStorageUtils {
  /**
   * Handles signal opened event.
   * @param tick - The opened signal tick data
   */
  handleOpened(tick: IStrategyTickResultOpened): Promise<void>;
  /**
   * Handles signal closed event.
   * @param tick - The closed signal tick data
   */
  handleClosed(tick: IStrategyTickResultClosed): Promise<void>;
  /**
   * Handles signal scheduled event.
   * @param tick - The scheduled signal tick data
   */
  handleScheduled(tick: IStrategyTickResultScheduled): Promise<void>;
  /**
   * Handles signal cancelled event.
   * @param tick - The cancelled signal tick data
   */
  handleCancelled(tick: IStrategyTickResultCancelled): Promise<void>;
  /**
   * Finds a signal by its ID.
   * @param id - The signal ID to search for
   * @returns The signal row or null if not found
   */
  findById(id: StorageId): Promise<IStorageSignalRow | null>;
  /**
   * Lists all stored signals.
   * @returns Array of all signal rows
   */
  list(): Promise<IStorageSignalRow[]>;
}

/**
 * Constructor type for storage adapters.
 * Used for custom storage implementations.
 */
export type TStorageUtilsCtor = new () => IStorageUtils;

/**
 * Persistent storage adapter for backtest signals.
 *
 * Features:
 * - Persists signals to disk using PersistStorageAdapter
 * - Lazy initialization with singleshot pattern
 * - Maintains up to MAX_SIGNALS (25) most recent signals
 * - Handles signal lifecycle events (opened, closed, scheduled, cancelled)
 * - Prevents duplicate updates based on timestamp comparison
 *
 * Use this adapter (default) for backtest signal persistence across sessions.
 */
export class StoragePersistBacktestUtils implements IStorageUtils {
  /** Map of signal IDs to signal rows */
  private _signals: Map<StorageId, IStorageSignalRow>;

  /**
   * Singleshot initialization function that loads signals from disk.
   * Protected by singleshot to ensure one-time execution.
   */
  private waitForInit = singleshot(async () => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_WAIT_FOR_INIT);
    const signalList = await PersistStorageAdapter.readStorageData(true);
    signalList.sort((a, b) => a.priority - b.priority);
    this._signals = new Map(
      signalList
        .slice(-GLOBAL_CONFIG.CC_MAX_SIGNALS)
        .map((signal) => [signal.id, signal]),
    );
  });

  /**
   * Removes oldest signal if limit is exceeded.
   */
  private _enforceLimit(): void {
    if (this._signals.size > GLOBAL_CONFIG.CC_MAX_SIGNALS) {
      const firstKey = this._signals.keys().next().value;
      if (firstKey) {
        this._signals.delete(firstKey);
      }
    }
  }

  /**
   * Persists the current signal map to disk storage.
   * Sorts signals by priority and keeps only the most recent MAX_SIGNALS.
   * @throws Error if not initialized
   */
  private async _updateStorage(): Promise<void> {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_UPDATE_STORAGE);
    if (!this._signals) {
      throw new Error(
        "StoragePersistBacktestUtils not initialized. Call waitForInit first.",
      );
    }
    const signalList = Array.from(this._signals.values());
    signalList.sort((a, b) => a.priority - b.priority);
    await PersistStorageAdapter.writeStorageData(
      signalList.slice(-GLOBAL_CONFIG.CC_MAX_SIGNALS),
      true,
    );
  }

  /**
   * Handles signal opened event.
   * Updates storage with opened status if not stale.
   * @param tick - The opened signal tick data
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
    this._enforceLimit();
    await this._updateStorage();
  };

  /**
   * Handles signal closed event.
   * Updates storage with closed status and PnL if not stale.
   * @param tick - The closed signal tick data
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
    this._enforceLimit();
    await this._updateStorage();
  };

  /**
   * Handles signal scheduled event.
   * Updates storage with scheduled status if not stale.
   * @param tick - The scheduled signal tick data
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
    this._enforceLimit();
    await this._updateStorage();
  };

  /**
   * Handles signal cancelled event.
   * Updates storage with cancelled status if not stale.
   * @param tick - The cancelled signal tick data
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
    this._enforceLimit();
    await this._updateStorage();
  };

  /**
   * Finds a signal by its ID.
   * @param id - The signal ID to search for
   * @returns The signal row or null if not found
   */
  public findById = async (
    id: StorageId,
  ): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_FIND_BY_ID, { id });
    await this.waitForInit();
    return this._signals.get(id) ?? null;
  };

  /**
   * Lists all stored signals.
   * @returns Array of all signal rows
   */
  public list = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_LIST);
    await this.waitForInit();
    return Array.from(this._signals.values());
  };
}

/**
 * In-memory storage adapter for backtest signals.
 *
 * Features:
 * - Stores signals in memory only (no persistence)
 * - Fast read/write operations
 * - Data is lost when application restarts
 * - Handles signal lifecycle events (opened, closed, scheduled, cancelled)
 * - Prevents duplicate updates based on timestamp comparison
 *
 * Use this adapter for testing or when persistence is not required.
 */
export class StorageMemoryBacktestUtils implements IStorageUtils {
  /** Map of signal IDs to signal rows */
  private _signals: Map<StorageId, IStorageSignalRow> = new Map();

  /**
   * Removes oldest signal if limit is exceeded.
   */
  private _enforceLimit(): void {
    if (this._signals.size > GLOBAL_CONFIG.CC_MAX_SIGNALS) {
      const firstKey = this._signals.keys().next().value;
      if (firstKey) {
        this._signals.delete(firstKey);
      }
    }
  }

  /**
   * Handles signal opened event.
   * Updates in-memory storage with opened status if not stale.
   * @param tick - The opened signal tick data
   */
  public handleOpened = async (tick: IStrategyTickResultOpened): Promise<void> => {
    backtest.loggerService.info(STORAGE_MEMORY_BACKTEST_METHOD_NAME_HANDLE_OPENED, {
      signalId: tick.signal.id,
    });
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
    this._enforceLimit();
  };

  /**
   * Handles signal closed event.
   * Updates in-memory storage with closed status and PnL if not stale.
   * @param tick - The closed signal tick data
   */
  public handleClosed = async (tick: IStrategyTickResultClosed): Promise<void> => {
    backtest.loggerService.info(STORAGE_MEMORY_BACKTEST_METHOD_NAME_HANDLE_CLOSED, {
      signalId: tick.signal.id,
    });
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
    this._enforceLimit();
  };

  /**
   * Handles signal scheduled event.
   * Updates in-memory storage with scheduled status if not stale.
   * @param tick - The scheduled signal tick data
   */
  public handleScheduled = async (tick: IStrategyTickResultScheduled): Promise<void> => {
    backtest.loggerService.info(STORAGE_MEMORY_BACKTEST_METHOD_NAME_HANDLE_SCHEDULED, {
      signalId: tick.signal.id,
    });
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
    this._enforceLimit();
  };

  /**
   * Handles signal cancelled event.
   * Updates in-memory storage with cancelled status if not stale.
   * @param tick - The cancelled signal tick data
   */
  public handleCancelled = async (tick: IStrategyTickResultCancelled): Promise<void> => {
    backtest.loggerService.info(STORAGE_MEMORY_BACKTEST_METHOD_NAME_HANDLE_CANCELLED, {
      signalId: tick.signal.id,
    });
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
    this._enforceLimit();
  };

  /**
   * Finds a signal by its ID.
   * @param id - The signal ID to search for
   * @returns The signal row or null if not found
   */
  public findById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_MEMORY_BACKTEST_METHOD_NAME_FIND_BY_ID, { id });
    return this._signals.get(id) ?? null;
  };

  /**
   * Lists all stored signals.
   * @returns Array of all signal rows
   */
  public list = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_MEMORY_BACKTEST_METHOD_NAME_LIST);
    return Array.from(this._signals.values());
  };
}

/**
 * Dummy storage adapter for backtest signals that discards all writes.
 *
 * Features:
 * - No-op implementation for all methods
 * - findById always returns null
 * - list always returns empty array
 *
 * Use this adapter to disable backtest signal storage completely.
 */
export class StorageDummyBacktestUtils implements IStorageUtils {
  /**
   * No-op handler for signal opened event.
   */
  public handleOpened = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for signal closed event.
   */
  public handleClosed = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for signal scheduled event.
   */
  public handleScheduled = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for signal cancelled event.
   */
  public handleCancelled = async (): Promise<void> => {
    void 0;
  };

  /**
   * Always returns null (no storage).
   * @returns null
   */
  public findById = async (): Promise<IStorageSignalRow | null> => {
    return null;
  };

  /**
   * Always returns empty array (no storage).
   * @returns Empty array
   */
  public list = async (): Promise<IStorageSignalRow[]> => {
    return [];
  };
}

/**
 * Persistent storage adapter for live trading signals.
 *
 * Features:
 * - Persists signals to disk using PersistStorageAdapter
 * - Lazy initialization with singleshot pattern
 * - Maintains up to MAX_SIGNALS (25) most recent signals
 * - Handles signal lifecycle events (opened, closed, scheduled, cancelled)
 * - Prevents duplicate updates based on timestamp comparison
 *
 * Use this adapter (default) for live signal persistence across sessions.
 */
export class StoragePersistLiveUtils implements IStorageUtils {
  /** Map of signal IDs to signal rows */
  private _signals: Map<StorageId, IStorageSignalRow>;

  /**
   * Singleshot initialization function that loads signals from disk.
   * Protected by singleshot to ensure one-time execution.
   */
  private waitForInit = singleshot(async () => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_WAIT_FOR_INIT);
    const signalList = await PersistStorageAdapter.readStorageData(false);
    signalList.sort((a, b) => a.priority - b.priority);
    this._signals = new Map(
      signalList
        .slice(-GLOBAL_CONFIG.CC_MAX_SIGNALS)
        .map((signal) => [signal.id, signal]),
    );
  });

  /**
   * Removes oldest signal if limit is exceeded.
   */
  private _enforceLimit(): void {
    if (this._signals.size > GLOBAL_CONFIG.CC_MAX_SIGNALS) {
      const firstKey = this._signals.keys().next().value;
      if (firstKey) {
        this._signals.delete(firstKey);
      }
    }
  }

  /**
   * Persists the current signal map to disk storage.
   * Sorts signals by priority and keeps only the most recent MAX_SIGNALS.
   * @throws Error if not initialized
   */
  private async _updateStorage(): Promise<void> {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_UPDATE_STORAGE);
    if (!this._signals) {
      throw new Error(
        "StoragePersistLiveUtils not initialized. Call waitForInit first.",
      );
    }
    const signalList = Array.from(this._signals.values());
    signalList.sort((a, b) => a.priority - b.priority);
    await PersistStorageAdapter.writeStorageData(
      signalList.slice(-GLOBAL_CONFIG.CC_MAX_SIGNALS),
      false,
    );
  }

  /**
   * Handles signal opened event.
   * Updates storage with opened status if not stale.
   * @param tick - The opened signal tick data
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
    this._enforceLimit();
    await this._updateStorage();
  };

  /**
   * Handles signal closed event.
   * Updates storage with closed status and PnL if not stale.
   * @param tick - The closed signal tick data
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
      pnl: tick.pnl,
      createdAt: lastStorage ? lastStorage.createdAt : tick.createdAt,
      updatedAt: tick.createdAt,
    });
    this._enforceLimit();
    await this._updateStorage();
  };

  /**
   * Handles signal scheduled event.
   * Updates storage with scheduled status if not stale.
   * @param tick - The scheduled signal tick data
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
    this._enforceLimit();
    await this._updateStorage();
  };

  /**
   * Handles signal cancelled event.
   * Updates storage with cancelled status if not stale.
   * @param tick - The cancelled signal tick data
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
    this._enforceLimit();
    await this._updateStorage();
  };

  /**
   * Finds a signal by its ID.
   * @param id - The signal ID to search for
   * @returns The signal row or null if not found
   */
  public findById = async (
    id: StorageId,
  ): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_FIND_BY_ID, { id });
    await this.waitForInit();
    return this._signals.get(id) ?? null;
  };

  /**
   * Lists all stored signals.
   * @returns Array of all signal rows
   */
  public list = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_LIST);
    await this.waitForInit();
    return Array.from(this._signals.values());
  };
}

/**
 * In-memory storage adapter for live trading signals.
 *
 * Features:
 * - Stores signals in memory only (no persistence)
 * - Fast read/write operations
 * - Data is lost when application restarts
 * - Handles signal lifecycle events (opened, closed, scheduled, cancelled)
 * - Prevents duplicate updates based on timestamp comparison
 *
 * Use this adapter for testing or when persistence is not required.
 */
export class StorageMemoryLiveUtils implements IStorageUtils {
  /** Map of signal IDs to signal rows */
  private _signals: Map<StorageId, IStorageSignalRow> = new Map();

  /**
   * Removes oldest signal if limit is exceeded.
   */
  private _enforceLimit(): void {
    if (this._signals.size > GLOBAL_CONFIG.CC_MAX_SIGNALS) {
      const firstKey = this._signals.keys().next().value;
      if (firstKey) {
        this._signals.delete(firstKey);
      }
    }
  }

  /**
   * Handles signal opened event.
   * Updates in-memory storage with opened status if not stale.
   * @param tick - The opened signal tick data
   */
  public handleOpened = async (tick: IStrategyTickResultOpened): Promise<void> => {
    backtest.loggerService.info(STORAGE_MEMORY_LIVE_METHOD_NAME_HANDLE_OPENED, {
      signalId: tick.signal.id,
    });
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
    this._enforceLimit();
  };

  /**
   * Handles signal closed event.
   * Updates in-memory storage with closed status and PnL if not stale.
   * @param tick - The closed signal tick data
   */
  public handleClosed = async (tick: IStrategyTickResultClosed): Promise<void> => {
    backtest.loggerService.info(STORAGE_MEMORY_LIVE_METHOD_NAME_HANDLE_CLOSED, {
      signalId: tick.signal.id,
    });
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
    this._enforceLimit();
  };

  /**
   * Handles signal scheduled event.
   * Updates in-memory storage with scheduled status if not stale.
   * @param tick - The scheduled signal tick data
   */
  public handleScheduled = async (tick: IStrategyTickResultScheduled): Promise<void> => {
    backtest.loggerService.info(STORAGE_MEMORY_LIVE_METHOD_NAME_HANDLE_SCHEDULED, {
      signalId: tick.signal.id,
    });
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
    this._enforceLimit();
  };

  /**
   * Handles signal cancelled event.
   * Updates in-memory storage with cancelled status if not stale.
   * @param tick - The cancelled signal tick data
   */
  public handleCancelled = async (tick: IStrategyTickResultCancelled): Promise<void> => {
    backtest.loggerService.info(STORAGE_MEMORY_LIVE_METHOD_NAME_HANDLE_CANCELLED, {
      signalId: tick.signal.id,
    });
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
    this._enforceLimit();
  };

  /**
   * Finds a signal by its ID.
   * @param id - The signal ID to search for
   * @returns The signal row or null if not found
   */
  public findById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_MEMORY_LIVE_METHOD_NAME_FIND_BY_ID, { id });
    return this._signals.get(id) ?? null;
  };

  /**
   * Lists all stored signals.
   * @returns Array of all signal rows
   */
  public list = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_MEMORY_LIVE_METHOD_NAME_LIST);
    return Array.from(this._signals.values());
  };
}

/**
 * Dummy storage adapter for live trading signals that discards all writes.
 *
 * Features:
 * - No-op implementation for all methods
 * - findById always returns null
 * - list always returns empty array
 *
 * Use this adapter to disable live signal storage completely.
 */
export class StorageDummyLiveUtils implements IStorageUtils {
  /**
   * No-op handler for signal opened event.
   */
  public handleOpened = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for signal closed event.
   */
  public handleClosed = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for signal scheduled event.
   */
  public handleScheduled = async (): Promise<void> => {
    void 0;
  };

  /**
   * No-op handler for signal cancelled event.
   */
  public handleCancelled = async (): Promise<void> => {
    void 0;
  };

  /**
   * Always returns null (no storage).
   * @returns null
   */
  public findById = async (): Promise<IStorageSignalRow | null> => {
    return null;
  };

  /**
   * Always returns empty array (no storage).
   * @returns Empty array
   */
  public list = async (): Promise<IStorageSignalRow[]> => {
    return [];
  };
}

/**
 * Backtest storage adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable storage implementations
 * - Default adapter: StoragePersistBacktestUtils (persistent storage)
 * - Alternative adapters: StorageMemoryBacktestUtils, StorageDummyBacktestUtils
 * - Convenience methods: usePersist(), useMemory(), useDummy()
 */
export class StorageBacktestAdapter implements IStorageUtils {
  /** Internal storage utils instance */
  private _signalBacktestUtils: IStorageUtils = new StorageMemoryBacktestUtils();

  /**
   * Handles signal opened event.
   * Proxies call to the underlying storage adapter.
   * @param tick - The opened signal tick data
   */
  handleOpened = async (tick: IStrategyTickResultOpened): Promise<void> => {
    return await this._signalBacktestUtils.handleOpened(tick);
  };

  /**
   * Handles signal closed event.
   * Proxies call to the underlying storage adapter.
   * @param tick - The closed signal tick data
   */
  handleClosed = async (tick: IStrategyTickResultClosed): Promise<void> => {
    return await this._signalBacktestUtils.handleClosed(tick);
  };

  /**
   * Handles signal scheduled event.
   * Proxies call to the underlying storage adapter.
   * @param tick - The scheduled signal tick data
   */
  handleScheduled = async (tick: IStrategyTickResultScheduled): Promise<void> => {
    return await this._signalBacktestUtils.handleScheduled(tick);
  };

  /**
   * Handles signal cancelled event.
   * Proxies call to the underlying storage adapter.
   * @param tick - The cancelled signal tick data
   */
  handleCancelled = async (tick: IStrategyTickResultCancelled): Promise<void> => {
    return await this._signalBacktestUtils.handleCancelled(tick);
  };

  /**
   * Finds a signal by its ID.
   * Proxies call to the underlying storage adapter.
   * @param id - The signal ID to search for
   * @returns The signal row or null if not found
   */
  findById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    return await this._signalBacktestUtils.findById(id);
  };

  /**
   * Lists all stored signals.
   * Proxies call to the underlying storage adapter.
   * @returns Array of all signal rows
   */
  list = async (): Promise<IStorageSignalRow[]> => {
    return await this._signalBacktestUtils.list();
  };

  /**
   * Sets the storage adapter constructor.
   * All future storage operations will use this adapter.
   *
   * @param Ctor - Constructor for storage adapter
   */
  useStorageAdapter = (Ctor: TStorageUtilsCtor): void => {
    backtest.loggerService.info(STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._signalBacktestUtils = Reflect.construct(Ctor, []);
  };

  /**
   * Switches to dummy storage adapter.
   * All future storage writes will be no-ops.
   */
  useDummy = (): void => {
    backtest.loggerService.info(STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this._signalBacktestUtils = new StorageDummyBacktestUtils();
  };

  /**
   * Switches to persistent storage adapter (default).
   * Signals will be persisted to disk.
   */
  usePersist = (): void => {
    backtest.loggerService.info(STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this._signalBacktestUtils = new StoragePersistBacktestUtils();
  };

  /**
   * Switches to in-memory storage adapter.
   * Signals will be stored in memory only.
   */
  useMemory = (): void => {
    backtest.loggerService.info(STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._signalBacktestUtils = new StorageMemoryBacktestUtils();
  };
}

/**
 * Live trading storage adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable storage implementations
 * - Default adapter: StoragePersistLiveUtils (persistent storage)
 * - Alternative adapters: StorageMemoryLiveUtils, StorageDummyLiveUtils
 * - Convenience methods: usePersist(), useMemory(), useDummy()
 */
export class StorageLiveAdapter implements IStorageUtils {
  /** Internal storage utils instance */
  private _signalLiveUtils: IStorageUtils = new StoragePersistLiveUtils();

  /**
   * Handles signal opened event.
   * Proxies call to the underlying storage adapter.
   * @param tick - The opened signal tick data
   */
  handleOpened = async (tick: IStrategyTickResultOpened): Promise<void> => {
    return await this._signalLiveUtils.handleOpened(tick);
  };

  /**
   * Handles signal closed event.
   * Proxies call to the underlying storage adapter.
   * @param tick - The closed signal tick data
   */
  handleClosed = async (tick: IStrategyTickResultClosed): Promise<void> => {
    return await this._signalLiveUtils.handleClosed(tick);
  };

  /**
   * Handles signal scheduled event.
   * Proxies call to the underlying storage adapter.
   * @param tick - The scheduled signal tick data
   */
  handleScheduled = async (tick: IStrategyTickResultScheduled): Promise<void> => {
    return await this._signalLiveUtils.handleScheduled(tick);
  };

  /**
   * Handles signal cancelled event.
   * Proxies call to the underlying storage adapter.
   * @param tick - The cancelled signal tick data
   */
  handleCancelled = async (tick: IStrategyTickResultCancelled): Promise<void> => {
    return await this._signalLiveUtils.handleCancelled(tick);
  };

  /**
   * Finds a signal by its ID.
   * Proxies call to the underlying storage adapter.
   * @param id - The signal ID to search for
   * @returns The signal row or null if not found
   */
  findById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    return await this._signalLiveUtils.findById(id);
  };

  /**
   * Lists all stored signals.
   * Proxies call to the underlying storage adapter.
   * @returns Array of all signal rows
   */
  list = async (): Promise<IStorageSignalRow[]> => {
    return await this._signalLiveUtils.list();
  };

  /**
   * Sets the storage adapter constructor.
   * All future storage operations will use this adapter.
   *
   * @param Ctor - Constructor for storage adapter
   */
  useStorageAdapter = (Ctor: TStorageUtilsCtor): void => {
    backtest.loggerService.info(STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._signalLiveUtils = Reflect.construct(Ctor, []);
  };

  /**
   * Switches to dummy storage adapter.
   * All future storage writes will be no-ops.
   */
  useDummy = (): void => {
    backtest.loggerService.info(STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this._signalLiveUtils = new StorageDummyLiveUtils();
  };

  /**
   * Switches to persistent storage adapter (default).
   * Signals will be persisted to disk.
   */
  usePersist = (): void => {
    backtest.loggerService.info(STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this._signalLiveUtils = new StoragePersistLiveUtils();
  };

  /**
   * Switches to in-memory storage adapter.
   * Signals will be stored in memory only.
   */
  useMemory = (): void => {
    backtest.loggerService.info(STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._signalLiveUtils = new StorageMemoryLiveUtils();
  };
}

/**
 * Main storage adapter that manages both backtest and live signal storage.
 *
 * Features:
 * - Subscribes to signal emitters for automatic storage updates
 * - Provides unified access to both backtest and live signals
 * - Singleshot enable pattern prevents duplicate subscriptions
 * - Cleanup function for proper unsubscription
 */
export class StorageAdapter {
  /**
   * Enables signal storage by subscribing to signal emitters.
   * Uses singleshot to ensure one-time subscription.
   *
   * @returns Cleanup function that unsubscribes from all emitters
   */
  public enable = singleshot(() => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_ENABLE);
    let unLive: Function;
    let unBacktest: Function;

    {
      const unBacktestOpen = signalBacktestEmitter
        .filter(({ action }) => action === "opened")
        .connect((tick: IStrategyTickResultOpened) =>
          StorageBacktest.handleOpened(tick),
        );

      const unBacktestClose = signalBacktestEmitter
        .filter(({ action }) => action === "closed")
        .connect((tick: IStrategyTickResultClosed) =>
          StorageBacktest.handleClosed(tick),
        );

      const unBacktestScheduled = signalBacktestEmitter
        .filter(({ action }) => action === "scheduled")
        .connect((tick: IStrategyTickResultScheduled) =>
          StorageBacktest.handleScheduled(tick),
        );

      const unBacktestCancelled = signalBacktestEmitter
        .filter(({ action }) => action === "cancelled")
        .connect((tick: IStrategyTickResultCancelled) =>
          StorageBacktest.handleCancelled(tick),
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
          StorageLive.handleOpened(tick),
        );

      const unLiveClose = signalLiveEmitter
        .filter(({ action }) => action === "closed")
        .connect((tick: IStrategyTickResultClosed) =>
          StorageLive.handleClosed(tick),
        );

      const unLiveScheduled = signalLiveEmitter
        .filter(({ action }) => action === "scheduled")
        .connect((tick: IStrategyTickResultScheduled) =>
          StorageLive.handleScheduled(tick),
        );

      const unLiveCancelled = signalLiveEmitter
        .filter(({ action }) => action === "cancelled")
        .connect((tick: IStrategyTickResultCancelled) =>
          StorageLive.handleCancelled(tick),
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
   * Disables signal storage by unsubscribing from all emitters.
   * Safe to call multiple times.
   */
  public disable = () => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_DISABLE);
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  /**
   * Finds a signal by ID across both backtest and live storage.
   *
   * @param id - The signal ID to search for
   * @returns The signal row or throws if not found
   * @throws Error if StorageAdapter is not enabled
   * @throws Error if signal is not found in either storage
   */
  public findSignalById = async (
    id: StorageId,
  ): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_FIND_SIGNAL_BY_ID, { id });
    if (!this.enable.hasValue()) {
      throw new Error("StorageAdapter is not enabled. Call enable() first.");
    }
    let result: IStorageSignalRow | null = null;
    if ((result = await StorageBacktest.findById(id))) {
      return result;
    }
    if ((result = await StorageLive.findById(id))) {
      return result;
    }
    throw new Error(`Storage signal with id ${id} not found`);
  };

  /**
   * Lists all backtest signals from storage.
   *
   * @returns Array of all backtest signal rows
   * @throws Error if StorageAdapter is not enabled
   */
  public listSignalBacktest = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_LIST_SIGNAL_BACKTEST);
    if (!this.enable.hasValue()) {
      throw new Error("StorageAdapter is not enabled. Call enable() first.");
    }
    return await StorageBacktest.list();
  };

  /**
   * Lists all live signals from storage.
   *
   * @returns Array of all live signal rows
   * @throws Error if StorageAdapter is not enabled
   */
  public listSignalLive = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_LIST_SIGNAL_LIVE);
    if (!this.enable.hasValue()) {
      throw new Error("StorageAdapter is not enabled. Call enable() first.");
    }
    return await StorageLive.list();
  };
}

/**
 * Global singleton instance of StorageAdapter.
 * Provides unified signal storage management for backtest and live trading.
 */
export const Storage = new StorageAdapter();

/**
 * Global singleton instance of StorageLiveAdapter.
 * Provides live trading signal storage with pluggable backends.
 */
export const StorageLive = new StorageLiveAdapter();

/**
 * Global singleton instance of StorageBacktestAdapter.
 * Provides backtest signal storage with pluggable backends.
 */
export const StorageBacktest = new StorageBacktestAdapter();
