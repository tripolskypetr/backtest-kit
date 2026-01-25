import { compose, singleshot } from "functools-kit";
import { signalBacktestEmitter, signalLiveEmitter } from "../config/emitters";
import { IStorageSignalRow, IStrategyTickResultCancelled, IStrategyTickResultClosed, IStrategyTickResultOpened, IStrategyTickResultScheduled } from "../interfaces/Strategy.interface";
import { PersistStorageAdapter } from "./Persist";

const MAX_SIGNALS = 250;

type SignalId = IStorageSignalRow["id"];

export class SignalBacktestUtils {

  private readonly _signals = new Map<SignalId, IStorageSignalRow>();

  public handleOpened = async (tick: IStrategyTickResultOpened) => {
    const lastSignal = this._signals.get(tick.signal.id);
    if (lastSignal && lastSignal.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "opened",
      createdAt: tick.createdAt,
    });
    
  }

  public handleClosed = async (tick: IStrategyTickResultClosed) => {
    const lastSignal = this._signals.get(tick.signal.id);
    if (lastSignal && lastSignal.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "closed",
      createdAt: tick.createdAt,
    });
  }
  
  public handleScheduled = async (tick: IStrategyTickResultScheduled) => {
    const lastSignal = this._signals.get(tick.signal.id);
    if (lastSignal && lastSignal.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "scheduled",
      createdAt: tick.createdAt,
    });
  }

  public handleCancelled = async (tick: IStrategyTickResultCancelled) => {
    const lastSignal = this._signals.get(tick.signal.id);
    if (lastSignal && lastSignal.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "cancelled",
      createdAt: tick.createdAt,
    });
  }
}

export class SignalLiveUtils {

  private _signals: Map<SignalId, IStorageSignalRow>;

  private waitForInit = singleshot(async () => {
    const persistedSignals = await PersistStorageAdapter.readStorageData();
    this._signals = new Map(persistedSignals.map((signal) => [signal.id, signal]));
  });

  private async _updateStorage(): Promise<void> {
    if (!this._signals) {
      throw new Error("SignalLiveUtils not initialized. Call waitForInit first.");
    }
    const signalList = Array.from(this._signals.values());
    signalList.sort((a, b) => b.createdAt - a.createdAt);
    await PersistStorageAdapter.writeStorageData(
      signalList.slice(-MAX_SIGNALS)
    );
  }

  public handleOpened = async (tick: IStrategyTickResultOpened) => {
    await this.waitForInit();
    const lastSignal = this._signals.get(tick.signal.id);
    if (lastSignal && lastSignal.createdAt > tick.createdAt) {
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
    const lastSignal = this._signals.get(tick.signal.id);
    if (lastSignal && lastSignal.createdAt > tick.createdAt) {
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
    const lastSignal = this._signals.get(tick.signal.id);
    if (lastSignal && lastSignal.createdAt > tick.createdAt) {
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
    const lastSignal = this._signals.get(tick.signal.id);
    if (lastSignal && lastSignal.createdAt > tick.createdAt) {
      return;
    }
    this._signals.set(tick.signal.id, {
      ...tick.signal,
      status: "cancelled",
      createdAt: tick.createdAt,
    });
    await this._updateStorage();
  }
}

export class SignalAdapter {

  _signalLiveUtils = new SignalLiveUtils();
  _signalBacktestUtils = new SignalBacktestUtils();

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
}

export const Signal = new SignalAdapter();
