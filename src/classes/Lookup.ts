import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import LoggerService from "../lib/services/base/LoggerService";

const METHOD_NAME_ADD_ACTIVITY = "LookupUtils.addActivity";
const METHOD_NAME_LIST_ACTIVITY = "LookupUtils.removeActivity";
const METHOD_NAME_REMOVE_ACTIVITY = "LookupUtils.listActivity";

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

export interface IActivityEntry {
  symbol: string;
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName?: FrameName;
  };
  backtest: boolean;
}

type Key =
  | `${string}:${StrategyName}:${ExchangeName}:${FrameName}:${"backtest"}`
  | `${string}:${StrategyName}:${ExchangeName}:${"live"}`;

const CREATE_KEY_FN = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): Key => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":") as Key;
};

export class LookupUtils {
  private readonly _lookupMap = new Map<Key, IActivityEntry>();

  public get isParallel() {
    return this._lookupMap.size > 1;
  }

  public addActivity = (activity: IActivityEntry) => {
    LOGGER_SERVICE.info(METHOD_NAME_ADD_ACTIVITY, {
      activity,
    });
    const key = CREATE_KEY_FN(
      activity.symbol,
      activity.context.strategyName,
      activity.context.exchangeName,
      activity.context.frameName,
      activity.backtest,
    );
    this._lookupMap.set(key, activity);
  };

  public removeActivity = (activity: IActivityEntry) => {
    LOGGER_SERVICE.info(METHOD_NAME_REMOVE_ACTIVITY, {
      activity,
    });
    const key = CREATE_KEY_FN(
      activity.symbol,
      activity.context.strategyName,
      activity.context.exchangeName,
      activity.context.frameName,
      activity.backtest,
    );
    this._lookupMap.delete(key);
  };

  public listActivity = () => {
    LOGGER_SERVICE.info(METHOD_NAME_LIST_ACTIVITY);
    return Array.from(this._lookupMap.values());
  };
}

export const Lookup = new LookupUtils();
