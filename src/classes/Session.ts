import { ExchangeName } from "../interfaces/Exchange.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { memoize, singleshot } from "functools-kit";

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

export interface ISessionInstance {
    waitForInit(initial: boolean): Promise<void>
    setData<Value extends object = object>(value: Value | null): Promise<void>;
    getData<Value extends object = object>(): Promise<Value | null>;
}

export type TSessionInstanceCtor = new (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
) => ISessionInstance;

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
        void 0;
    });

    public setData = async <Value extends object = object>(value: Value | null): Promise<void> => {
        this._data = value;
    }

    public getData = async <Value extends object = object>(): Promise<Value | null> => {
        return <Value>this._data;
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

    public setData = async <Value extends object = object>(_value: Value | null): Promise<void> => {
        void 0;
    }

    public getData = async <Value extends object = object>(): Promise<Value | null> => {
        return null
    }
}

type TSessionAdapter = {
  [key in Exclude<keyof ISessionInstance, "waitForInit">]: any;
}

export class SessionAdapter implements TSessionAdapter {
    private SessionFactory: TSessionInstanceCtor = SessionLocalInstance;

    private getInstance = memoize(
        ([strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(strategyName, exchangeName, frameName, backtest),
        (strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): ISessionInstance =>
        Reflect.construct(this.SessionFactory, [strategyName, exchangeName, frameName, backtest]),
    );

    public setData = async <Value extends object = object>(value: Value, context: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }, backtest: boolean): Promise<void> => {
        const key = CREATE_KEY_FN(context.strategyName, context.exchangeName, context.frameName, backtest);
        const isInitial = !this.getInstance.has(key);
        const instance = this.getInstance(context.strategyName, context.exchangeName, context.frameName, backtest);
        await instance.waitForInit(isInitial);
        return await instance.setData<Value>(value);
    }

    public getData = async <Value extends object = object>(context: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; }, backtest: boolean): Promise<Value | null> => {
        const key = CREATE_KEY_FN(context.strategyName, context.exchangeName, context.frameName, backtest);
        const isInitial = !this.getInstance.has(key);
        const instance = this.getInstance(context.strategyName, context.exchangeName, context.frameName, backtest);
        await instance.waitForInit(isInitial);
        return await instance.getData<Value>();
    }

    public useLocal = (): void => {
        this.SessionFactory = SessionLocalInstance;
    };

    public useDummy = (): void => {
        this.SessionFactory = SessionDummyInstance;
    };

    public useSessionAdapter = (Ctor: TSessionInstanceCtor): void => {
        this.SessionFactory = Ctor;
    };
}

export const Session = new SessionAdapter();
