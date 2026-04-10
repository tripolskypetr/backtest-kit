import { memoize } from "functools-kit";
import { CandleInterval, ExchangeName } from "../interfaces/Exchange.interface";
import { ISignalIntervalDto, StrategyName } from "../interfaces/Strategy.interface";
import backtest, { ExecutionContextService, MethodContextService } from "../lib";
import { FrameName } from "../interfaces/Frame.interface";
import { PersistIntervalAdapter } from "./Persist";

export type TIntervalFn = (symbol: string, when: Date) => Promise<ISignalIntervalDto | null>;

const INTERVAL_METHOD_NAME_RUN = "IntervalInstance.run";
const INTERVAL_FILE_INSTANCE_METHOD_NAME_RUN = "IntervalFileInstance.run";
const INTERVAL_METHOD_NAME_FN = "IntervalUtils.fn";
const INTERVAL_METHOD_NAME_FN_CLEAR = "IntervalUtils.fn.clear";
const INTERVAL_METHOD_NAME_FILE = "IntervalUtils.file";
const INTERVAL_METHOD_NAME_DISPOSE = "IntervalUtils.dispose";
const INTERVAL_METHOD_NAME_CLEAR = "IntervalUtils.clear";

const MS_PER_MINUTE = 60_000;

const INTERVAL_MINUTES: Record<CandleInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "1d": 1440,
  "1w": 10080,
};

const align = (timestamp: number, interval: CandleInterval): number => {
  const intervalMinutes = INTERVAL_MINUTES[interval];
  if (!intervalMinutes) {
    throw new Error(`align: unknown interval=${interval}`);
  }
  const intervalMs = intervalMinutes * MS_PER_MINUTE;
  return Math.floor(timestamp / intervalMs) * intervalMs;
};

type Key =
  | `${StrategyName}:${ExchangeName}:${FrameName}:${"backtest"}`
  | `${StrategyName}:${ExchangeName}:${"live"}`;

const CREATE_KEY_FN = (
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  isBacktest: boolean
): Key => {
  const parts = [strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(isBacktest ? "backtest" : "live");
  return parts.join(":") as Key;
};

export type TIntervalFileFn = (symbol: string, ...args: any[]) => Promise<ISignalIntervalDto | null>;

type DropFirst<T extends (...args: any) => any> =
  T extends (first: any, ...rest: infer R) => any ? R : never;

type IntervalFileKeyArgs<T extends TIntervalFileFn> = [
  symbol: string,
  alignMs: number,
  ...rest: DropFirst<T>
];

/**
 * Instance class for firing a function exactly once per interval boundary.
 *
 * On the first call within a new interval the wrapped function is invoked and
 * its result is returned. Every subsequent call within the same interval returns
 * `null` without invoking the function again.
 *
 * @example
 * ```typescript
 * const instance = new IntervalInstance(mySignalFn, "1h");
 * await instance.run("BTCUSDT"); // → ISignalIntervalDto | null  (fn called)
 * await instance.run("BTCUSDT"); // → null               (skipped, same interval)
 * // After 1 hour passes:
 * await instance.run("BTCUSDT"); // → ISignalIntervalDto | null  (fn called again)
 * ```
 */
export class IntervalInstance {
  /** Stores the last aligned timestamp per context+symbol key */
  private _stateMap = new Map<string, number>();

  constructor(
    readonly fn: TIntervalFn,
    readonly interval: CandleInterval,
  ) {}

  public run = async (symbol: string): Promise<ISignalIntervalDto | null> => {
    backtest.loggerService.debug(INTERVAL_METHOD_NAME_RUN, { symbol });

    const step = INTERVAL_MINUTES[this.interval];

    {
      if (!MethodContextService.hasContext()) {
        throw new Error("IntervalInstance run requires method context");
      }
      if (!ExecutionContextService.hasContext()) {
        throw new Error("IntervalInstance run requires execution context");
      }
      if (!step) {
        throw new Error(`IntervalInstance unknown interval=${this.interval}`);
      }
    }

    const contextKey = CREATE_KEY_FN(
      backtest.methodContextService.context.strategyName,
      backtest.methodContextService.context.exchangeName,
      backtest.methodContextService.context.frameName,
      backtest.executionContextService.context.backtest
    );
    const key = `${contextKey}:${symbol}`;
    const currentWhen = backtest.executionContextService.context.when;
    const currentAligned = align(currentWhen.getTime(), this.interval);

    if (this._stateMap.get(key) === currentAligned) {
      return null;
    }

    const result = await this.fn(symbol, currentWhen);
    if (result !== null) {
      this._stateMap.set(key, currentAligned);
    }
    return result;
  };

  public clear = () => {
    const contextKey = CREATE_KEY_FN(
      backtest.methodContextService.context.strategyName,
      backtest.methodContextService.context.exchangeName,
      backtest.methodContextService.context.frameName,
      backtest.executionContextService.context.backtest
    );
    const prefix = `${contextKey}:`;
    for (const key of this._stateMap.keys()) {
      if (key.startsWith(prefix)) {
        this._stateMap.delete(key);
      }
    }
  };
}

/**
 * Instance class for firing an async function exactly once per interval boundary,
 * with the fired state persisted to disk via `PersistMeasureAdapter`.
 *
 * On the first call within a new interval the wrapped function is invoked.
 * If it returns a non-null signal, that result is written to disk and returned.
 * Every subsequent call within the same interval returns `null` (file already exists).
 * If the function returns `null`, nothing is written and the next call retries.
 *
 * @template T - Async function type: `(symbol: string, ...args) => Promise<ISignalIntervalDto | null>`
 *
 * @example
 * ```typescript
 * const instance = new IntervalFileInstance(fetchSignal, "1h", "mySignal");
 * await instance.run("BTCUSDT"); // → ISignalIntervalDto | null  (fn called)
 * await instance.run("BTCUSDT"); // → null                       (file exists, already fired)
 * ```
 */
export class IntervalFileInstance<T extends TIntervalFileFn = TIntervalFileFn> {
  /** Global counter — incremented once per IntervalFileInstance construction */
  private static _indexCounter = 0;

  private static createIndex(): number {
    return IntervalFileInstance._indexCounter++;
  }

  public static clearCounter(): void {
    IntervalFileInstance._indexCounter = 0;
  }

  readonly index: number;

  constructor(
    readonly fn: T,
    readonly interval: CandleInterval,
    readonly name: string,
    readonly key: (args: IntervalFileKeyArgs<T>) => string = ([symbol, alignMs]) => `${symbol}_${alignMs}`
  ) {
    this.index = IntervalFileInstance.createIndex();
  }

  public run = async (...args: Parameters<T>): Promise<ISignalIntervalDto | null> => {
    backtest.loggerService.debug(INTERVAL_FILE_INSTANCE_METHOD_NAME_RUN, { args });

    const step = INTERVAL_MINUTES[this.interval];

    {
      if (!MethodContextService.hasContext()) {
        throw new Error("IntervalFileInstance run requires method context");
      }
      if (!ExecutionContextService.hasContext()) {
        throw new Error("IntervalFileInstance run requires execution context");
      }
      if (!step) {
        throw new Error(`IntervalFileInstance unknown interval=${this.interval}`);
      }
    }

    const [symbol, ...rest] = args;
    const { when } = backtest.executionContextService.context;
    const alignedTs = align(when.getTime(), this.interval);
    const bucket = `${this.name}_${this.interval}_${this.index}`;
    const entityKey = this.key([symbol, alignedTs, ...rest as DropFirst<T>]);

    const cached = await PersistIntervalAdapter.readIntervalData(bucket, entityKey);
    if (cached !== null) {
      return null;
    }

    const result = await this.fn.call(null, ...args);
    if (result !== null) {
      await PersistIntervalAdapter.writeIntervalData({ id: entityKey, data: result }, bucket, entityKey);
    }
    return result;
  };
}

/**
 * Utility class for wrapping signal functions with once-per-interval firing.
 * Exported as singleton instance `Interval` for convenient usage.
 *
 * @example
 * ```typescript
 * import { Interval } from "./classes/Interval";
 *
 * const fireOncePerHour = Interval.fn(mySignalFn, { interval: "1h" });
 * await fireOncePerHour("BTCUSDT", when); // fn called — returns its result
 * await fireOncePerHour("BTCUSDT", when); // returns null (same interval)
 * ```
 */
export class IntervalUtils {
  private _getInstance = memoize(
    ([run]) => run,
    (run: TIntervalFn, interval: CandleInterval) =>
      new IntervalInstance(run, interval)
  );

  private _getFileInstance = memoize(
    ([run]) => run,
    <T extends TIntervalFileFn>(
      run: T,
      interval: CandleInterval,
      name: string,
      key?: (args: IntervalFileKeyArgs<T>) => string
    ) => new IntervalFileInstance(run, interval, name, key)
  );

  public fn = (
    run: TIntervalFn,
    context: { interval: CandleInterval }
  ): TIntervalFn & { clear(): void } => {
    backtest.loggerService.info(INTERVAL_METHOD_NAME_FN, { context });

    const wrappedFn = (symbol: string, _when: Date): Promise<ISignalIntervalDto | null> => {
      const instance = this._getInstance(run, context.interval);
      return instance.run(symbol);
    };

    wrappedFn.clear = () => {
      backtest.loggerService.info(INTERVAL_METHOD_NAME_FN_CLEAR);
      if (!MethodContextService.hasContext()) {
        backtest.loggerService.warn(`${INTERVAL_METHOD_NAME_FN_CLEAR} called without method context, skipping`);
        return;
      }
      if (!ExecutionContextService.hasContext()) {
        backtest.loggerService.warn(`${INTERVAL_METHOD_NAME_FN_CLEAR} called without execution context, skipping`);
        return;
      }
      this._getInstance.get(run)?.clear();
    };

    return wrappedFn as TIntervalFn & { clear(): void };
  };

  public file = <T extends TIntervalFileFn>(
    run: T,
    context: {
      interval: CandleInterval;
      name: string;
      key?: (args: IntervalFileKeyArgs<T>) => string;
    }
  ): T => {
    backtest.loggerService.info(INTERVAL_METHOD_NAME_FILE, { context });

    const wrappedFn = (...args: Parameters<T>): Promise<ISignalIntervalDto | null> => {
      const instance = this._getFileInstance(run, context.interval, context.name, context.key);
      return instance.run(...args);
    };

    return wrappedFn as unknown as T;
  };

  public dispose = (run: TIntervalFn) => {
    backtest.loggerService.info(INTERVAL_METHOD_NAME_DISPOSE, { run });
    this._getInstance.clear(run);
  };

  public clear = () => {
    backtest.loggerService.info(INTERVAL_METHOD_NAME_CLEAR);
    this._getInstance.clear();
    this._getFileInstance.clear();
    IntervalFileInstance.clearCounter();
  };
}

export const Interval = new IntervalUtils();
