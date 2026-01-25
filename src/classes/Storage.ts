import { compose, singleshot } from "functools-kit";
import { signalBacktestEmitter, signalLiveEmitter } from "../config/emitters";
import { IStorageSignalRow, IStrategyTickResultCancelled, IStrategyTickResultClosed, IStrategyTickResultOpened, IStrategyTickResultScheduled } from "../interfaces/Strategy.interface";
import { PersistStorageAdapter } from "./Persist";

const MAX_SIGNALS = 250;

type StorageId = IStorageSignalRow["id"];

export class StorageBacktestUtils {

  private readonly _signals = new Map<StorageId, IStorageSignalRow>();

  public handleOpened = async (tick: IStrategyTickResultOpened) => {
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "opened",
      createdAt: tick.createdAt,
    });
    
  }

  public handleClosed = async (tick: IStrategyTickResultClosed) => {
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "closed",
      createdAt: tick.createdAt,
    });
  }
  
  public handleScheduled = async (tick: IStrategyTickResultScheduled) => {
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "scheduled",
      createdAt: tick.createdAt,
    });
  }

  public handleCancelled = async (tick: IStrategyTickResultCancelled) => {
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "cancelled",
      createdAt: tick.createdAt,
    });
  }

  public findById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    return this._signals.get(id) ?? null;
  }

  public list = async (): Promise<IStorageSignalRow[]> => {
    return Array.from(this._signals.values());
  }
}

export class StorageLiveUtils {

  private _signals: Map<StorageId, IStorageSignalRow>;

  private waitForInit = singleshot(async () => {
    const persistedStorages = await PersistStorageAdapter.readStorageData();
    this._signals = new Map(persistedStorages.map((signal) => [signal.id, signal]));
  });

  private async _updateStorage(): Promise<void> {
    if (!this._signals) {
      throw new Error("StorageLiveUtils not initialized. Call waitForInit first.");
    }
    const signalList = Array.from(this._signals.values());
    signalList.sort((a, b) => a.createdAt - b.createdAt);
    await PersistStorageAdapter.writeStorageData(
      signalList.slice(-MAX_SIGNALS)
    );
  }

  public handleOpened = async (tick: IStrategyTickResultOpened) => {
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "opened",
      createdAt: tick.createdAt,
    });
    await this._updateStorage();
  }

  public handleClosed = async (tick: IStrategyTickResultClosed) => {
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "closed",
      createdAt: tick.createdAt,
    });
    await this._updateStorage();
  }

  public handleScheduled = async (tick: IStrategyTickResultScheduled) => {
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "scheduled",
      createdAt: tick.createdAt,
    });
    await this._updateStorage();
  }

  public handleCancelled = async (tick: IStrategyTickResultCancelled) => {
    await this.waitForInit();
    const lastStorage = this._signals.get(tick.signal.id);
    if (lastStorage && lastStorage.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "cancelled",
      createdAt: tick.createdAt,
    });
    await this._updateStorage();
  }

  public findById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    await this.waitForInit();
    return this._signals.get(id) ?? null;
  }

  public list = async (): Promise<IStorageSignalRow[]> => {
    await this.waitForInit();
    return Array.from(this._signals.values());
  }
}

export class StorageAdapter {

  _signalLiveUtils = new StorageLiveUtils();
  _signalBacktestUtils = new StorageBacktestUtils();

  public enable = singleshot(() => {

    let unLive: Function;
    let unBacktest: Function;

    {
      const unBacktestOpen = signalBacktestEmitter
        .filter(({ action }) => action === "opened")
        .connect((tick: IStrategyTickResultOpened) => this._signalBacktestUtils.handleOpened(tick));
      
      const unBacktestClose = signalBacktestEmitter
        .filter(({ action }) => action === "closed")
        .connect((tick: IStrategyTickResultClosed) => this._signalBacktestUtils.handleClosed(tick));

      const unBacktestScheduled = signalBacktestEmitter
        .filter(({ action }) => action === "scheduled")
        .connect((tick: IStrategyTickResultScheduled) => this._signalBacktestUtils.handleScheduled(tick));

      const unBacktestCancelled = signalBacktestEmitter
        .filter(({ action }) => action === "cancelled")
        .connect((tick: IStrategyTickResultCancelled) => this._signalBacktestUtils.handleCancelled(tick));
      
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
        .connect((tick: IStrategyTickResultOpened) => this._signalLiveUtils.handleOpened(tick));

      const unLiveClose = signalLiveEmitter
        .filter(({ action }) => action === "closed")
        .connect((tick: IStrategyTickResultClosed) => this._signalLiveUtils.handleClosed(tick));

      const unLiveScheduled = signalLiveEmitter
        .filter(({ action }) => action === "scheduled")
        .connect((tick: IStrategyTickResultScheduled) => this._signalLiveUtils.handleScheduled(tick));

      const unLiveCancelled = signalLiveEmitter
        .filter(({ action }) => action === "cancelled")
        .connect((tick: IStrategyTickResultCancelled) => this._signalLiveUtils.handleCancelled(tick));
      
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
    }
  });

  public disable = () => {
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  public findSignalById = async (id: StorageId): Promise<IStorageSignalRow | null> => {
    let result: IStorageSignalRow | null = null;
    if (result = await this._signalBacktestUtils.findById(id)) {
      return result;
    }
    if (result = await this._signalLiveUtils.findById(id)) {
      return result;
    }
    throw new Error(`Storage signal with id ${id} not found`);
  };

  public listSignalBacktest = async (): Promise<IStorageSignalRow[]> => {
    return await this._signalBacktestUtils.list();
  };

  public listSignalLive = async (): Promise<IStorageSignalRow[]> => {
    return await this._signalLiveUtils.list();
  };
}

export const Storage = new StorageAdapter();
