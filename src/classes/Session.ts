import { memoize, singleshot } from "functools-kit";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { PersistSessionAdapter } from "./Persist";
import swarm from "../lib";

type Key =
  | `${StrategyName}:${ExchangeName}:${FrameName}:${"backtest"}`
  | `${StrategyName}:${ExchangeName}:${"live"}`;

const CREATE_KEY_FN = (
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): Key => {
  const parts = [strategyName, exchangeName];
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

export interface ISessionInstance {
  waitForInit(initial: boolean): Promise<void>;
  setData<Value extends object = object>(value: Value | null): Promise<void>;
  getData<Value extends object = object>(): Promise<Value | null>;
  dispose(): Promise<void>;
}

export type TSessionInstanceCtor = new (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean,
) => ISessionInstance;

type TSessionAdapter = {
  [key in Exclude<keyof ISessionInstance, "waitForInit" | "dispose">]: any;
};

export class SessionLocalInstance implements ISessionInstance {
  _data: unknown = null;

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
  ) { }

  public waitForInit = singleshot(async (_initial: boolean) => {
    this._data = null;
  });

  public getData = async <Value extends object = object>(): Promise<Value | null> => {
    swarm.loggerService.debug(SESSION_LOCAL_INSTANCE_METHOD_NAME_GET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
    return <Value>this._data;
  };

  public setData = async <Value extends object = object>(value: Value | null): Promise<void> => {
    swarm.loggerService.debug(SESSION_LOCAL_INSTANCE_METHOD_NAME_SET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
    this._data = value;
  };

  public async dispose(): Promise<void> {
    swarm.loggerService.debug(SESSION_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
  }
}

export class SessionDummyInstance implements ISessionInstance {
  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
  ) { }

  public waitForInit = singleshot(async (_initial: boolean) => {
    void 0;
  });

  public getData = async <Value extends object = object>(): Promise<Value | null> => {
    return null;
  };

  public setData = async <Value extends object = object>(_value: Value | null): Promise<void> => {
    void 0;
  };

  public async dispose(): Promise<void> {
    void 0;
  }
}

export class SessionPersistInstance implements ISessionInstance {
  _data: unknown = null;

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
  ) { }

  public waitForInit = singleshot(async (initial: boolean) => {
    swarm.loggerService.debug(SESSION_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      initial,
    });
    await PersistSessionAdapter.waitForInit(this.strategyName, this.exchangeName, this.frameName, initial);
    const data = await PersistSessionAdapter.readSessionData(this.strategyName, this.exchangeName, this.frameName);
    if (data) {
      this._data = data.data;
      return;
    }
    this._data = null;
  });

  public getData = async <Value extends object = object>(): Promise<Value | null> => {
    swarm.loggerService.debug(SESSION_PERSIST_INSTANCE_METHOD_NAME_GET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
    return <Value>this._data;
  };

  public setData = async <Value extends object = object>(value: Value | null): Promise<void> => {
    swarm.loggerService.debug(SESSION_PERSIST_INSTANCE_METHOD_NAME_SET, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
    this._data = value;
    const id = CREATE_KEY_FN(this.strategyName, this.exchangeName, this.frameName, this.backtest);
    await PersistSessionAdapter.writeSessionData(
      { id, data: value as object | null },
      this.strategyName,
      this.exchangeName,
      this.frameName,
    );
  };

  public async dispose(): Promise<void> {
    swarm.loggerService.debug(SESSION_LIVE_ADAPTER_METHOD_NAME_DISPOSE, {
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
    await PersistSessionAdapter.dispose(this.strategyName, this.exchangeName, this.frameName);
  }
}

export class SessionBacktestAdapter implements TSessionAdapter {
  private SessionFactory: TSessionInstanceCtor = SessionLocalInstance;

  private getInstance = memoize(
    ([symbol, strategyName, exchangeName, frameName, backtest]) =>
      CREATE_KEY_FN(strategyName, exchangeName, frameName, backtest),
    (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): ISessionInstance =>
      Reflect.construct(this.SessionFactory, [symbol, strategyName, exchangeName, frameName, backtest]),
  );

  public disposeSession = (strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): void => {
    const key = CREATE_KEY_FN(strategyName, exchangeName, frameName, backtest);
    const instance = this.getInstance.get(key);
    instance && instance.dispose();
    this.getInstance.clear(key);
  };

  public getData = async <Value extends object = object>(context: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }): Promise<Value | null> => {
    swarm.loggerService.debug(SESSION_BACKTEST_ADAPTER_METHOD_NAME_GET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
    });
    const key = CREATE_KEY_FN(context.strategyName, context.exchangeName, context.frameName, true);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(context.symbol, context.strategyName, context.exchangeName, context.frameName, true);
    await instance.waitForInit(isInitial);
    return await instance.getData<Value>();
  };

  public setData = async <Value extends object = object>(value: Value | null, context: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }): Promise<void> => {
    swarm.loggerService.debug(SESSION_BACKTEST_ADAPTER_METHOD_NAME_SET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
    });
    const key = CREATE_KEY_FN(context.strategyName, context.exchangeName, context.frameName, true);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(context.symbol, context.strategyName, context.exchangeName, context.frameName, true);
    await instance.waitForInit(isInitial);
    return await instance.setData<Value>(value);
  };

  public useLocal = (): void => {
    swarm.loggerService.info(SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.SessionFactory = SessionLocalInstance;
  };

  public usePersist = (): void => {
    swarm.loggerService.info(SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.SessionFactory = SessionPersistInstance;
  };

  public useDummy = (): void => {
    swarm.loggerService.info(SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.SessionFactory = SessionDummyInstance;
  };

  public useSessionAdapter = (Ctor: TSessionInstanceCtor): void => {
    swarm.loggerService.info(SESSION_BACKTEST_ADAPTER_METHOD_NAME_USE_SESSION_ADAPTER);
    this.SessionFactory = Ctor;
  };

  public clear = (): void => {
    swarm.loggerService.info(SESSION_BACKTEST_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

export class SessionLiveAdapter implements TSessionAdapter {
  private SessionFactory: TSessionInstanceCtor = SessionPersistInstance;

  private getInstance = memoize(
    ([symbol, strategyName, exchangeName, frameName, backtest]) =>
      CREATE_KEY_FN(strategyName, exchangeName, frameName, backtest),
    (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): ISessionInstance =>
      Reflect.construct(this.SessionFactory, [symbol, strategyName, exchangeName, frameName, backtest]),
  );

  public disposeSession = (strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): void => {
    const key = CREATE_KEY_FN(strategyName, exchangeName, frameName, backtest);
    const instance = this.getInstance.get(key);
    instance && instance.dispose();
    this.getInstance.clear(key);
  };

  public getData = async <Value extends object = object>(context: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }): Promise<Value | null> => {
    swarm.loggerService.debug(SESSION_LIVE_ADAPTER_METHOD_NAME_GET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
    });
    const key = CREATE_KEY_FN(context.strategyName, context.exchangeName, context.frameName, false);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(context.symbol, context.strategyName, context.exchangeName, context.frameName, false);
    await instance.waitForInit(isInitial);
    return await instance.getData<Value>();
  };

  public setData = async <Value extends object = object>(value: Value | null, context: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }): Promise<void> => {
    swarm.loggerService.debug(SESSION_LIVE_ADAPTER_METHOD_NAME_SET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
    });
    const key = CREATE_KEY_FN(context.strategyName, context.exchangeName, context.frameName, false);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(context.symbol, context.strategyName, context.exchangeName, context.frameName, false);
    await instance.waitForInit(isInitial);
    return await instance.setData<Value>(value);
  };

  public useLocal = (): void => {
    swarm.loggerService.info(SESSION_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.SessionFactory = SessionLocalInstance;
  };

  public usePersist = (): void => {
    swarm.loggerService.info(SESSION_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.SessionFactory = SessionPersistInstance;
  };

  public useDummy = (): void => {
    swarm.loggerService.info(SESSION_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.SessionFactory = SessionDummyInstance;
  };

  public useSessionAdapter = (Ctor: TSessionInstanceCtor): void => {
    swarm.loggerService.info(SESSION_LIVE_ADAPTER_METHOD_NAME_USE_SESSION_ADAPTER);
    this.SessionFactory = Ctor;
  };

  public clear = (): void => {
    swarm.loggerService.info(SESSION_LIVE_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

export class SessionAdapter {
  public getData = async <Value extends object = object>(context: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }, backtest: boolean): Promise<Value | null> => {
    swarm.loggerService.debug(SESSION_ADAPTER_METHOD_NAME_GET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest,
    });
    if (backtest) {
      return await SessionBacktest.getData<Value>(context);
    }
    return await SessionLive.getData<Value>(context);
  };

  public setData = async <Value extends object = object>(value: Value | null, context: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }, backtest: boolean): Promise<void> => {
    swarm.loggerService.debug(SESSION_ADAPTER_METHOD_NAME_SET, {
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      backtest,
    });
    if (backtest) {
      return await SessionBacktest.setData<Value>(value, context);
    }
    return await SessionLive.setData<Value>(value, context);
  };
}

export const Session = new SessionAdapter();

export const SessionLive = new SessionLiveAdapter();

export const SessionBacktest = new SessionBacktestAdapter();
