import {
  IPublicSignalRow,
  IScheduledSignalRow,
} from "../interfaces/Strategy.interface";
import { State, Dispatch, BucketName } from "../classes/State";
import lib, { ExecutionContextService, MethodContextService } from "../lib";

const CREATE_SIGNAL_STATE_METHOD_NAME = "state.createSignalState";

interface IStateParams<Value extends object = object> {
  bucketName: BucketName;
  initialValue: Value;
}

const CREATE_SET_STATE_FN =
  <Value extends object = object>(params: IStateParams<Value>) =>
  async (dispatch: Value | Dispatch<Value>) => {
    if (!ExecutionContextService.hasContext()) {
      throw new Error("getSignalState requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("getSignalState requires a method context");
    }
    const { backtest: isBacktest, symbol } =
      lib.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      lib.methodContextService.context;
    const currentPrice =
      await lib.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await lib.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return State.setState(dispatch, {
        backtest: isBacktest,
        bucketName: params.bucketName,
        initialValue: params.initialValue,
        signalId: signal.id,
      });
    }
    if (
      signal = await lib.strategyCoreService.getScheduledSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return State.setState(dispatch, {
        backtest: isBacktest,
        bucketName: params.bucketName,
        initialValue: params.initialValue,
        signalId: signal.id,
      });
    }
    throw new Error(
      `signal CREATE_SET_STATE_FN requires a pending or scheduled signal for symbol=${symbol} bucketName=${params.bucketName}`,
    );
  };

const CREATE_GET_STATE_FN =
  <Value extends object = object>(params: IStateParams<Value>) =>
  async () => {
    if (!ExecutionContextService.hasContext()) {
      throw new Error("getSignalState requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("getSignalState requires a method context");
    }
    const { backtest: isBacktest, symbol } =
      lib.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      lib.methodContextService.context;
    const currentPrice =
      await lib.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await lib.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return State.getState<Value>({
        backtest: isBacktest,
        bucketName: params.bucketName,
        initialValue: params.initialValue,
        signalId: signal.id,
      });
    }
    if (
      signal = await lib.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return State.getState<Value>({
        backtest: isBacktest,
        bucketName: params.bucketName,
        initialValue: params.initialValue,
        signalId: signal.id,
      });
    }
    throw new Error(
      `signal CREATE_GET_STATE_FN requires a pending or scheduled signal for symbol=${symbol} bucketName=${params.bucketName}`,
    );
  };

type GetStateFn<Value extends object = object> = () => Promise<Value>;
type SetStateFn<Value extends object = object> = (
  dispatch: Value | Dispatch<Value>,
) => Promise<Value>;

type State<Value extends object = object> = [GetStateFn<Value>, SetStateFn<Value>];

export function createSignalState<Value extends object = object>(
  params: IStateParams<Value>,
): State<Value> {
  lib.loggerService.log(CREATE_SIGNAL_STATE_METHOD_NAME, {
    bucketName: params.bucketName,
  });
  return [
    CREATE_GET_STATE_FN<Value>(params),
    CREATE_SET_STATE_FN<Value>(params),
  ] as const;
}
