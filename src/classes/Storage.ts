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

type StorageId = IStorageSignalRow["id"];

export interface IStorageUtils {
  handleOpened(tick: IStrategyTickResultOpened): Promise<void>;
  handleClosed(tick: IStrategyTickResultClosed): Promise<void>;
  handleScheduled(tick: IStrategyTickResultScheduled): Promise<void>;
  handleCancelled(tick: IStrategyTickResultCancelled): Promise<void>;
  findById(id: StorageId): Promise<IStorageSignalRow | null>;
  list(): Promise<IStorageSignalRow[]>;
}

export type TStorageUtilsCtor = new () => IStorageUtils;

export class StoragePersistBacktestUtils implements IStorageUtils {
  private _signals: Map<StorageId, IStorageSignalRow>;

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
      signalList.slice(-MAX_SIGNALS),
      true,
    );
  }

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

  public findById = async (
    id: StorageId,
  ): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_FIND_BY_ID, { id });
    await this.waitForInit();
    return this._signals.get(id) ?? null;
  };

  public list = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_BACKTEST_METHOD_NAME_LIST);
    await this.waitForInit();
    return Array.from(this._signals.values());
  };
}

export class StorageMemoryBacktestUtils implements IStorageUtils {
  private _signals: Map<StorageId, IStorageSignalRow> = new Map();

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
  };

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
  };

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
  };

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
  };

  public findById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_MEMORY_BACKTEST_METHOD_NAME_FIND_BY_ID, { id });
    return this._signals.get(id) ?? null;
  };

  public list = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_MEMORY_BACKTEST_METHOD_NAME_LIST);
    return Array.from(this._signals.values());
  };
}

export class StorageDummyBacktestUtils implements IStorageUtils {
  public handleOpened = async (): Promise<void> => {
    void 0;
  };

  public handleClosed = async (): Promise<void> => {
    void 0;
  };

  public handleScheduled = async (): Promise<void> => {
    void 0;
  };

  public handleCancelled = async (): Promise<void> => {
    void 0;
  };

  public findById = async (): Promise<IStorageSignalRow | null> => {
    return null;
  };

  public list = async (): Promise<IStorageSignalRow[]> => {
    return [];
  };
}

export class StoragePersistLiveUtils implements IStorageUtils {
  private _signals: Map<StorageId, IStorageSignalRow>;

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
      signalList.slice(-MAX_SIGNALS),
      false,
    );
  }

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
    await this._updateStorage();
  };

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

  public findById = async (
    id: StorageId,
  ): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_FIND_BY_ID, { id });
    await this.waitForInit();
    return this._signals.get(id) ?? null;
  };

  public list = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_LIVE_METHOD_NAME_LIST);
    await this.waitForInit();
    return Array.from(this._signals.values());
  };
}

export class StorageMemoryLiveUtils implements IStorageUtils {
  private _signals: Map<StorageId, IStorageSignalRow> = new Map();

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
  };

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
  };

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
  };

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
  };

  public findById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    backtest.loggerService.info(STORAGE_MEMORY_LIVE_METHOD_NAME_FIND_BY_ID, { id });
    return this._signals.get(id) ?? null;
  };

  public list = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_MEMORY_LIVE_METHOD_NAME_LIST);
    return Array.from(this._signals.values());
  };
}

export class StorageDummyLiveUtils implements IStorageUtils {
  public handleOpened = async (): Promise<void> => {
    void 0;
  };

  public handleClosed = async (): Promise<void> => {
    void 0;
  };

  public handleScheduled = async (): Promise<void> => {
    void 0;
  };

  public handleCancelled = async (): Promise<void> => {
    void 0;
  };

  public findById = async (): Promise<IStorageSignalRow | null> => {
    return null;
  };

  public list = async (): Promise<IStorageSignalRow[]> => {
    return [];
  };
}

export class StorageBacktestAdapter implements IStorageUtils {
  private _signalBacktestUtils: IStorageUtils = new StoragePersistBacktestUtils();

  handleOpened = async (tick: IStrategyTickResultOpened): Promise<void> => {
    return await this._signalBacktestUtils.handleOpened(tick);
  };

  handleClosed = async (tick: IStrategyTickResultClosed): Promise<void> => {
    return await this._signalBacktestUtils.handleClosed(tick);
  };

  handleScheduled = async (tick: IStrategyTickResultScheduled): Promise<void> => {
    return await this._signalBacktestUtils.handleScheduled(tick);
  };

  handleCancelled = async (tick: IStrategyTickResultCancelled): Promise<void> => {
    return await this._signalBacktestUtils.handleCancelled(tick);
  };

  findById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    return await this._signalBacktestUtils.findById(id);
  };

  list = async (): Promise<IStorageSignalRow[]> => {
    return await this._signalBacktestUtils.list();
  };

  useStorageAdapter = (Ctor: TStorageUtilsCtor): void => {
    backtest.loggerService.info(STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._signalBacktestUtils = Reflect.construct(Ctor, []);
  };

  useDummy = (): void => {
    backtest.loggerService.info(STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this._signalBacktestUtils = new StorageDummyBacktestUtils();
  };

  usePersist = (): void => {
    backtest.loggerService.info(STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this._signalBacktestUtils = new StoragePersistBacktestUtils();
  };

  useMemory = (): void => {
    backtest.loggerService.info(STORAGE_BACKTEST_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._signalBacktestUtils = new StorageMemoryBacktestUtils();
  };
}

export class StorageLiveAdapter implements IStorageUtils {
  private _signalLiveUtils: IStorageUtils = new StoragePersistLiveUtils();

  handleOpened = async (tick: IStrategyTickResultOpened): Promise<void> => {
    return await this._signalLiveUtils.handleOpened(tick);
  };

  handleClosed = async (tick: IStrategyTickResultClosed): Promise<void> => {
    return await this._signalLiveUtils.handleClosed(tick);
  };

  handleScheduled = async (tick: IStrategyTickResultScheduled): Promise<void> => {
    return await this._signalLiveUtils.handleScheduled(tick);
  };

  handleCancelled = async (tick: IStrategyTickResultCancelled): Promise<void> => {
    return await this._signalLiveUtils.handleCancelled(tick);
  };

  findById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    return await this._signalLiveUtils.findById(id);
  };

  list = async (): Promise<IStorageSignalRow[]> => {
    return await this._signalLiveUtils.list();
  };

  useStorageAdapter = (Ctor: TStorageUtilsCtor): void => {
    backtest.loggerService.info(STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._signalLiveUtils = Reflect.construct(Ctor, []);
  };

  useDummy = (): void => {
    backtest.loggerService.info(STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this._signalLiveUtils = new StorageDummyLiveUtils();
  };

  usePersist = (): void => {
    backtest.loggerService.info(STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this._signalLiveUtils = new StoragePersistLiveUtils();
  };

  useMemory = (): void => {
    backtest.loggerService.info(STORAGE_LIVE_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._signalLiveUtils = new StorageMemoryLiveUtils();
  };
}

export class StorageAdapter {

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

  public disable = () => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_DISABLE);
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

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

  public listSignalBacktest = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_LIST_SIGNAL_BACKTEST);
    if (!this.enable.hasValue()) {
      throw new Error("StorageAdapter is not enabled. Call enable() first.");
    }
    return await StorageBacktest.list();
  };

  public listSignalLive = async (): Promise<IStorageSignalRow[]> => {
    backtest.loggerService.info(STORAGE_ADAPTER_METHOD_NAME_LIST_SIGNAL_LIVE);
    if (!this.enable.hasValue()) {
      throw new Error("StorageAdapter is not enabled. Call enable() first.");
    }
    return await StorageLive.list();
  };
}

export const Storage = new StorageAdapter();
export const StorageLive = new StorageLiveAdapter();
export const StorageBacktest = new StorageBacktestAdapter();
