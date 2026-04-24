import { compose, memoize, randomString, singleshot } from "functools-kit";
import { signalEmitter } from "../config/emitters";
import { PersistStateAdapter } from "./Persist";

const CREATE_KEY_FN = (signalId: string, bucketName: string) =>
  `${signalId}-${bucketName}`;

type Dispatch<Value extends object = object> = (value: Value) => Value | Promise<Value>;

type BucketName = string;

export interface IStateInstance {
  waitForInit(initial: boolean): Promise<void>;
  getState<Value extends object = object>(): Promise<Value>;
  setState<Value extends object = object>(dispatch: Value | Dispatch<Value>): Promise<Value>;
  dispose(): Promise<void>;
}

export type TStateInstanceCtor = new (initialValue: object, signalId: string, bucketName: string) => IStateInstance;

export class StateLocalInstance implements IStateInstance {
  
  _value: object;
  
  constructor(
    readonly initialValue: object,
    readonly signalId: string,
    readonly bucketName: string,
  ) { }

  public waitForInit = singleshot(async (_initial: boolean) => {
    this._value = this.initialValue;
  });

  public async getState<Value extends object = object>(): Promise<Value> {
    return <Value>this._value;
  }

  public async setState<Value extends object = object>(dispatch: Value | Dispatch<Value>): Promise<Value> {
    if (typeof dispatch === "function") {
      this._value = await dispatch(<Value>this._value);
    } else {
      this._value = dispatch;
    }
    return <Value> this._value;
  }

  public async dispose(): Promise<void> {
    void 0;
  }
}

export class StateDummyInstance implements IStateInstance {
  constructor(
    readonly initialValue: object,
    readonly signalId: string,
    readonly bucketName: string,
  ) { }

  public waitForInit = singleshot(async (_initial: boolean) => {
    void 0;
  });

  public async getState<Value extends object = object>(): Promise<Value> {
    return <Value>this.initialValue;
  }

  public async setState<Value extends object = object>(_dispatch: Value | Dispatch<Value>): Promise<Value> {
    return <Value>this.initialValue;
  }

  public async dispose(): Promise<void> {
    void 0;
  }
}

export class StatePersistInstance implements IStateInstance {

  _value: object;

  constructor(
    readonly initialValue: object,
    readonly signalId: string,
    readonly bucketName: string,
  ) { }

  public waitForInit = singleshot(async (initial: boolean) => {
    await PersistStateAdapter.waitForInit(this.signalId, this.bucketName, initial);
    const data = await PersistStateAdapter.readStateData(this.signalId, this.bucketName);
    if (data) {
      this._value = data.data;
      return;
    }
    this._value = this.initialValue;
  });

  public async getState<Value extends object = object>(): Promise<Value> {
    return <Value>this._value;
  }

  public async setState<Value extends object = object>(dispatch: Value | Dispatch<Value>): Promise<Value> {
    if (typeof dispatch === "function") {
      this._value = await dispatch(<Value>this._value);
    } else {
      this._value = dispatch;
    }
    await PersistStateAdapter.writeStateData(
      { id: randomString(), data: this._value },
      this.signalId,
      this.bucketName,
    );
    return <Value>this._value;
  }

  public async dispose(): Promise<void> {
    await PersistStateAdapter.dispose(this.signalId, this.bucketName);
  }
}

type TStateAdapter = {
  [key in Exclude<keyof IStateInstance, "waitForInit" | "dispose">]: any;
}

export class StateAdapter implements TStateAdapter{
  private StateFactory: TStateInstanceCtor = StatePersistInstance;

  private getInstance = memoize(
    ([signalId, bucketName]) => CREATE_KEY_FN(signalId, bucketName),
    (signalId: string, bucketName: BucketName, initialValue: object): IStateInstance =>
      Reflect.construct(this.StateFactory, [initialValue, signalId, bucketName]),
  );

  public enable = singleshot(() => {

    const handleDispose = (signalId: string) => {
      const prefix = CREATE_KEY_FN(signalId, "");
      for (const key of this.getInstance.keys()) {
        if (key.startsWith(prefix)) {
          const instance = this.getInstance.get(key);
          instance && instance.dispose();
          this.getInstance.clear(key);
        }
      }
    };

    const unCancel = signalEmitter
      .filter(({ action }) => action === "cancelled")
      .connect(({ signal }) => handleDispose(signal.id));

    const unClose = signalEmitter
      .filter(({ action }) => action === "closed")
      .connect(({ signal }) => handleDispose(signal.id));

    return compose(
      () => unCancel(),
      () => unClose(),
    );
  });

  public disable = () => {
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  public getState = async <Value extends object = object>(dto: { signalId: string, bucketName: BucketName, initialValue: object }): Promise<Value> => {
    if (!this.enable.hasValue()) {
      throw new Error("StateAdapter is not enabled. Call enable() first.");
    }
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName, dto.initialValue);
    await instance.waitForInit(isInitial);
    return await instance.getState();
  };

  public setState = async <Value extends object = object>(dispatch: Value | Dispatch<Value>, dto: { signalId: string, bucketName: BucketName, initialValue: object }): Promise<Value> => {
    if (!this.enable.hasValue()) {
      throw new Error("StateAdapter is not enabled. Call enable() first.");
    }
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName, dto.initialValue);
    await instance.waitForInit(isInitial);
    return await instance.setState(dispatch);
  };

  public useLocal = (): void => {
    this.StateFactory = StateLocalInstance;
  };

  public usePersist = (): void => {
    this.StateFactory = StatePersistInstance;
  };

  public useDummy = (): void => {
    this.StateFactory = StateDummyInstance;
  };

  public useStateAdapter = (Ctor: TStateInstanceCtor): void => {
    this.StateFactory = Ctor;
  };
  
  public clear = (): void => {
    this.getInstance.clear();
  };

}

export const State = new StateAdapter();
