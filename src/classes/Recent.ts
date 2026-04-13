import { compose, singleshot } from "functools-kit";
import { activePingSubject } from "../config/emitters";
import { ActivePingContract } from "../contract/ActivePing.contract";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import {
  IPublicSignalRow,
  StrategyName,
} from "../interfaces/Strategy.interface";
import { PersistRecentAdapter } from "./Persist";
import lib from "../lib";

const RECENT_PERSIST_BACKTEST_METHOD_NAME_HANDLE_ACTIVE_PING = "RecentPersistBacktestUtils.handleActivePing";
const RECENT_PERSIST_BACKTEST_METHOD_NAME_GET_LATEST_SIGNAL = "RecentPersistBacktestUtils.getLatestSignal";

const RECENT_PERSIST_LIVE_METHOD_NAME_HANDLE_ACTIVE_PING = "RecentPersistLiveUtils.handleActivePing";
const RECENT_PERSIST_LIVE_METHOD_NAME_GET_LATEST_SIGNAL = "RecentPersistLiveUtils.getLatestSignal";

const RECENT_MEMORY_BACKTEST_METHOD_NAME_HANDLE_ACTIVE_PING = "RecentMemoryBacktestUtils.handleActivePing";
const RECENT_MEMORY_BACKTEST_METHOD_NAME_GET_LATEST_SIGNAL = "RecentMemoryBacktestUtils.getLatestSignal";

const RECENT_MEMORY_LIVE_METHOD_NAME_HANDLE_ACTIVE_PING = "RecentMemoryLiveUtils.handleActivePing";
const RECENT_MEMORY_LIVE_METHOD_NAME_GET_LATEST_SIGNAL = "RecentMemoryLiveUtils.getLatestSignal";

const RECENT_BACKTEST_ADAPTER_METHOD_NAME_USE_ADAPTER = "RecentBacktestAdapter.useRecentAdapter";
const RECENT_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST = "RecentBacktestAdapter.usePersist";
const RECENT_BACKTEST_ADAPTER_METHOD_NAME_USE_MEMORY = "RecentBacktestAdapter.useMemory";
const RECENT_BACKTEST_ADAPTER_METHOD_NAME_CLEAR = "RecentBacktestAdapter.clear";

const RECENT_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER = "RecentLiveAdapter.useRecentAdapter";
const RECENT_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST = "RecentLiveAdapter.usePersist";
const RECENT_LIVE_ADAPTER_METHOD_NAME_USE_MEMORY = "RecentLiveAdapter.useMemory";
const RECENT_LIVE_ADAPTER_METHOD_NAME_CLEAR = "RecentLiveAdapter.clear";

const RECENT_ADAPTER_METHOD_NAME_ENABLE = "RecentAdapter.enable";
const RECENT_ADAPTER_METHOD_NAME_DISABLE = "RecentAdapter.disable";
const RECENT_ADAPTER_METHOD_NAME_GET_LATEST_SIGNAL = "RecentAdapter.getLatestSignal";

/**
 * Base interface for recent signal storage adapters.
 */
export interface IRecentUtils {
  /**
   * Handles active ping event and persists the latest signal.
   * @param event - Active ping contract with signal data
   */
  handleActivePing(event: ActivePingContract): Promise<void>;
  /**
   * Retrieves the latest active signal for the given context.
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Frame identifier
   * @param backtest - Flag indicating if the context is backtest or live
   * @returns The latest signal or null if not found
   */
  getLatestSignal(
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ): Promise<IPublicSignalRow | null>;
}

/**
 * Constructor type for recent signal storage adapters.
 */
export type TRecentUtilsCtor = new () => IRecentUtils;

/**
 * Persistent storage adapter for backtest recent signals.
 *
 * Features:
 * - Persists the latest active signal per context to disk using PersistRecentAdapter
 * - Handles active ping events only
 *
 * Use this adapter for backtest recent signal persistence across sessions.
 */
export class RecentPersistBacktestUtils implements IRecentUtils {
  public handleActivePing = async (event: ActivePingContract): Promise<void> => {
    lib.loggerService.info(RECENT_PERSIST_BACKTEST_METHOD_NAME_HANDLE_ACTIVE_PING, {
      signalId: event.data.id,
    });
    await PersistRecentAdapter.writeRecentData(
      event.data,
      event.symbol,
      event.strategyName,
      event.exchangeName,
      event.data.frameName,
      event.backtest,
    );
  };

  public getLatestSignal = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ): Promise<IPublicSignalRow | null> => {
    lib.loggerService.info(RECENT_PERSIST_BACKTEST_METHOD_NAME_GET_LATEST_SIGNAL, {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest: backtest,
    });
    return await PersistRecentAdapter.readRecentData(
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    );
  };
}

/**
 * In-memory storage adapter for backtest recent signals.
 *
 * Features:
 * - Stores the latest active signal per context key in memory only
 * - Fast read/write operations
 * - Data is lost when application restarts
 *
 * Use this adapter for testing or when persistence is not required.
 */
export class RecentMemoryBacktestUtils implements IRecentUtils {
  private _signals: Map<string, IPublicSignalRow> = new Map();

  public handleActivePing = async (event: ActivePingContract): Promise<void> => {
    lib.loggerService.info(RECENT_MEMORY_BACKTEST_METHOD_NAME_HANDLE_ACTIVE_PING, {
      signalId: event.data.id,
    });
    const key = this.createKeyParts(
      event.symbol,
      event.strategyName,
      event.exchangeName,
      event.data.frameName,
      event.backtest,
    );
    this._signals.set(key, event.data);
  };

  private createKeyParts = (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ) => {
    const parts = [symbol, strategyName, exchangeName];
    if (frameName) parts.push(frameName);
    parts.push(backtest ? "backtest" : "live");
    return parts.join(":");
  }

  public getLatestSignal = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ): Promise<IPublicSignalRow | null> => {
    const key = this.createKeyParts(
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    );
    lib.loggerService.info(RECENT_MEMORY_BACKTEST_METHOD_NAME_GET_LATEST_SIGNAL, { key });
    return this._signals.get(key) ?? null;
  };
}

/**
 * Persistent storage adapter for live recent signals.
 *
 * Features:
 * - Persists the latest active signal per context to disk using PersistRecentAdapter
 * - Handles active ping events only
 *
 * Use this adapter (default) for live recent signal persistence across sessions.
 */
export class RecentPersistLiveUtils implements IRecentUtils {
  public handleActivePing = async (event: ActivePingContract): Promise<void> => {
    lib.loggerService.info(RECENT_PERSIST_LIVE_METHOD_NAME_HANDLE_ACTIVE_PING, {
      signalId: event.data.id,
    });
    await PersistRecentAdapter.writeRecentData(
      event.data,
      event.symbol,
      event.strategyName,
      event.exchangeName,
      event.data.frameName,
      event.backtest,
    );
  };

  public getLatestSignal = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ): Promise<IPublicSignalRow | null> => {
    lib.loggerService.info(RECENT_PERSIST_LIVE_METHOD_NAME_GET_LATEST_SIGNAL, {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest: backtest,
    });
    return await PersistRecentAdapter.readRecentData(
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    );
  };
}

/**
 * In-memory storage adapter for live recent signals.
 *
 * Features:
 * - Stores the latest active signal per context key in memory only
 * - Fast read/write operations
 * - Data is lost when application restarts
 *
 * Use this adapter for testing or when persistence is not required.
 */
export class RecentMemoryLiveUtils implements IRecentUtils {
  private _signals: Map<string, IPublicSignalRow> = new Map();

  private createKeyParts = (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ) => {
    const parts = [symbol, strategyName, exchangeName];
    if (frameName) parts.push(frameName);
    parts.push(backtest ? "backtest" : "live");
    return parts.join(":");
  }

  public handleActivePing = async (event: ActivePingContract): Promise<void> => {
    lib.loggerService.info(RECENT_MEMORY_LIVE_METHOD_NAME_HANDLE_ACTIVE_PING, {
      signalId: event.data.id,
    });
    const key = this.createKeyParts(
      event.symbol,
      event.strategyName,
      event.exchangeName,
      event.data.frameName,
      event.backtest,
    );
    this._signals.set(key, event.data);
  };

  public getLatestSignal = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ): Promise<IPublicSignalRow | null> => {
    const key = this.createKeyParts(symbol, strategyName, exchangeName, frameName, backtest);
    lib.loggerService.info(RECENT_MEMORY_LIVE_METHOD_NAME_GET_LATEST_SIGNAL, { key });
    return this._signals.get(key) ?? null;
  };
}

/**
 * Backtest recent signal adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable storage implementations
 * - Default adapter: RecentMemoryBacktestUtils (in-memory storage)
 * - Alternative adapter: RecentPersistBacktestUtils
 * - Convenience methods: usePersist(), useMemory()
 */
export class RecentBacktestAdapter implements IRecentUtils {
  private _recentBacktestUtils: IRecentUtils = new RecentMemoryBacktestUtils();

  handleActivePing = async (event: ActivePingContract): Promise<void> => {
    return await this._recentBacktestUtils.handleActivePing(event);
  };

  getLatestSignal = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ): Promise<IPublicSignalRow | null> => {
    return await this._recentBacktestUtils.getLatestSignal(
      symbol, 
      strategyName, 
      exchangeName, 
      frameName,
      backtest,
    );
  };

  /**
   * Sets the storage adapter constructor.
   * All future storage operations will use this adapter.
   *
   * @param Ctor - Constructor for recent adapter
   */
  useRecentAdapter = (Ctor: TRecentUtilsCtor): void => {
    lib.loggerService.info(RECENT_BACKTEST_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._recentBacktestUtils = Reflect.construct(Ctor, []);
  };

  /**
   * Switches to persistent storage adapter.
   * Signals will be persisted to disk.
   */
  usePersist = (): void => {
    lib.loggerService.info(RECENT_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this._recentBacktestUtils = new RecentPersistBacktestUtils();
  };

  /**
   * Switches to in-memory storage adapter (default).
   * Signals will be stored in memory only.
   */
  useMemory = (): void => {
    lib.loggerService.info(RECENT_BACKTEST_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._recentBacktestUtils = new RecentMemoryBacktestUtils();
  };

  /**
   * Clears the cached utils instance by resetting to the default in-memory adapter.
   */
  public clear = (): void => {
    lib.loggerService.info(RECENT_BACKTEST_ADAPTER_METHOD_NAME_CLEAR);
    this._recentBacktestUtils = new RecentMemoryBacktestUtils();
  };
}

/**
 * Live recent signal adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable storage implementations
 * - Default adapter: RecentPersistLiveUtils (persistent storage)
 * - Alternative adapter: RecentMemoryLiveUtils
 * - Convenience methods: usePersist(), useMemory()
 */
export class RecentLiveAdapter implements IRecentUtils {
  private _recentLiveUtils: IRecentUtils = new RecentPersistLiveUtils();

  handleActivePing = async (event: ActivePingContract): Promise<void> => {
    return await this._recentLiveUtils.handleActivePing(event);
  };

  getLatestSignal = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ): Promise<IPublicSignalRow | null> => {
    return await this._recentLiveUtils.getLatestSignal(
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    );
  };

  /**
   * Sets the storage adapter constructor.
   * All future storage operations will use this adapter.
   *
   * @param Ctor - Constructor for recent adapter
   */
  useRecentAdapter = (Ctor: TRecentUtilsCtor): void => {
    lib.loggerService.info(RECENT_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._recentLiveUtils = Reflect.construct(Ctor, []);
  };

  /**
   * Switches to persistent storage adapter (default).
   * Signals will be persisted to disk.
   */
  usePersist = (): void => {
    lib.loggerService.info(RECENT_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this._recentLiveUtils = new RecentPersistLiveUtils();
  };

  /**
   * Switches to in-memory storage adapter.
   * Signals will be stored in memory only.
   */
  useMemory = (): void => {
    lib.loggerService.info(RECENT_LIVE_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._recentLiveUtils = new RecentMemoryLiveUtils();
  };

  /**
   * Clears the cached utils instance by resetting to the default persistent adapter.
   */
  public clear = (): void => {
    lib.loggerService.info(RECENT_LIVE_ADAPTER_METHOD_NAME_CLEAR);
    this._recentLiveUtils = new RecentPersistLiveUtils();
  };
}

/**
 * Main recent signal adapter that manages both backtest and live recent signal storage.
 *
 * Features:
 * - Subscribes to activePingSubject for automatic storage updates
 * - Provides unified access to the latest signal for any context
 * - Singleshot enable pattern prevents duplicate subscriptions
 * - Cleanup function for proper unsubscription
 */
export class RecentAdapter {
  /**
   * Enables recent signal storage by subscribing to activePingSubject.
   * Uses singleshot to ensure one-time subscription.
   *
   * @returns Cleanup function that unsubscribes from all emitters
   */
  public enable = singleshot(() => {
    lib.loggerService.info(RECENT_ADAPTER_METHOD_NAME_ENABLE);
    let unBacktest: Function;
    let unLive: Function;

    {
      const unBacktestPingActive = activePingSubject
        .filter(({ backtest }) => backtest)
        .connect((event) => RecentBacktest.handleActivePing(event));

      unBacktest = compose(
        () => unBacktestPingActive(),
      );
    }

    {
      const unLivePingActive = activePingSubject
        .filter(({ backtest }) => !backtest)
        .connect((event) => RecentLive.handleActivePing(event));

      unLive = compose(
        () => unLivePingActive(),
      );
    }

    const unEnable = () => this.enable.clear();

    return compose(
      () => unBacktest(),
      () => unLive(),
      () => unEnable(),
    )
  });

  /**
   * Disables recent signal storage by unsubscribing from all emitters.
   * Safe to call multiple times.
   */
  public disable = () => {
    lib.loggerService.info(RECENT_ADAPTER_METHOD_NAME_DISABLE);
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  /**
   * Retrieves the latest active signal for the given symbol and context.
   * Searches backtest storage first, then live storage.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, and frameName
   * @returns The latest signal or null if not found
   * @throws Error if RecentAdapter is not enabled
   */
  public getLatestSignal = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest: boolean,
  ): Promise<IPublicSignalRow | null> => {
    lib.loggerService.info(RECENT_ADAPTER_METHOD_NAME_GET_LATEST_SIGNAL, {
      symbol,
      context,
    });
    if (!this.enable.hasValue()) {
      throw new Error("RecentAdapter is not enabled. Call enable() first.");
    }
    const backtestResult = await RecentBacktest.getLatestSignal(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName,
      backtest,
    );
    if (backtestResult) {
      return backtestResult;
    }
    return await RecentLive.getLatestSignal(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName,
      backtest,
    );
  };
}

/**
 * Global singleton instance of RecentAdapter.
 * Provides unified recent signal management for backtest and live trading.
 */
export const Recent = new RecentAdapter();

/**
 * Global singleton instance of RecentLiveAdapter.
 * Provides live trading recent signal storage with pluggable backends.
 */
export const RecentLive = new RecentLiveAdapter();

/**
 * Global singleton instance of RecentBacktestAdapter.
 * Provides backtest recent signal storage with pluggable backends.
 */
export const RecentBacktest = new RecentBacktestAdapter();
