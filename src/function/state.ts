import {
  IPublicSignalRow,
  IScheduledSignalRow,
} from "../interfaces/Strategy.interface";
import { State, Dispatch, BucketName } from "../classes/State";
import lib, { ExecutionContextService, MethodContextService } from "../lib";

const CREATE_SIGNAL_STATE_METHOD_NAME = "state.createSignalState";

/**
 * Parameters for createSignalState — bucket name and default value shape.
 */
interface IStateParams<Value extends object = object> {
  /** Logical namespace for grouping state buckets within a signal, e.g. "trade" or "metrics". */
  bucketName: BucketName;
  /** Default value used when no persisted state exists for the signal. */
  initialValue: Value;
}

/**
 * Reads the current state value for the active pending or scheduled signal.
 * Resolved from execution context — no signalId argument required.
 * @returns Current state value
 * @throws Error if no pending or scheduled signal exists
 */
type GetStateFn<Value extends object = object> = () => Promise<Value>;

/**
 * Updates the state value for the active pending or scheduled signal.
 * Resolved from execution context — no signalId argument required.
 * @param dispatch - New value or updater function receiving current value
 * @returns Updated state value
 * @throws Error if no pending or scheduled signal exists
 */
type SetStateFn<Value extends object = object> = (
  dispatch: Value | Dispatch<Value>,
) => Promise<Value>;

/**
 * Tuple returned by createSignalState — [getState, setState] bound to the bucket.
 * Both functions resolve the active signal and backtest flag from execution context automatically.
 */
type SignalStateTuple<Value extends object = object> = [GetStateFn<Value>, SetStateFn<Value>];

const CREATE_SET_STATE_FN =
  <Value extends object = object>(params: IStateParams<Value>) =>
  async (dispatch: Value | Dispatch<Value>) => {
    if (!ExecutionContextService.hasContext()) {
      throw new Error("createSignalState requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("createSignalState requires a method context");
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
      return await State.setState(dispatch, {
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
      return await State.setState(dispatch, {
        backtest: isBacktest,
        bucketName: params.bucketName,
        initialValue: params.initialValue,
        signalId: signal.id,
      });
    }
    throw new Error(
      `createSignalState requires a pending or scheduled signal for symbol=${symbol} bucketName=${params.bucketName}`,
    );
  };

const CREATE_GET_STATE_FN =
  <Value extends object = object>(params: IStateParams<Value>) =>
  async () => {
    if (!ExecutionContextService.hasContext()) {
      throw new Error("createSignalState requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("createSignalState requires a method context");
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
      return await State.getState<Value>({
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
      return await State.getState<Value>({
        backtest: isBacktest,
        bucketName: params.bucketName,
        initialValue: params.initialValue,
        signalId: signal.id,
      });
    }
    throw new Error(
      `createSignalState requires a pending or scheduled signal for symbol=${symbol} bucketName=${params.bucketName}`,
    );
  };

/**
 * Creates a bound [getState, setState] tuple scoped to a bucket and initial value.
 *
 * Both returned functions resolve the active pending or scheduled signal and the
 * backtest/live flag automatically from execution context — no signalId argument required.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * Intended for LLM-driven capitulation strategies that accumulate per-trade
 * metrics (e.g. peakPercent, minutesOpen) across onActivePing ticks.
 * Profitable trades endure -0.5–2.5% drawdown and reach peak 2–3%+.
 * SL trades show peak < 0.15% (Feb08, Feb13) or never go positive (Feb25).
 * Rule: if minutesOpen >= N and peakPercent < threshold (e.g. 0.3%) — exit.
 *
 * @param params.bucketName - Logical namespace for grouping state buckets within a signal
 * @param params.initialValue - Default value when no persisted state exists
 * @returns Tuple [getState, setState] bound to the bucket and initial value
 *
 * @example
 * ```typescript
 * import { createSignalState } from "backtest-kit";
 *
 * const [getTradeState, setTradeState] = createSignalState({
 *   bucketName: "trade",
 *   initialValue: { peakPercent: 0, minutesOpen: 0 },
 * });
 *
 * // in onActivePing:
 * await setTradeState((s) => ({
 *   peakPercent: Math.max(s.peakPercent, currentUnrealisedPercent),
 *   minutesOpen: s.minutesOpen + 1,
 * }));
 * const { peakPercent, minutesOpen } = await getTradeState();
 * if (minutesOpen >= 15 && peakPercent < 0.3) await commitMarketClose(symbol);
 * ```
 */
export function createSignalState<Value extends object = object>(
  params: IStateParams<Value>,
): SignalStateTuple<Value> {
  lib.loggerService.info(CREATE_SIGNAL_STATE_METHOD_NAME, {
    bucketName: params.bucketName,
  });
  return [
    CREATE_GET_STATE_FN<Value>(params),
    CREATE_SET_STATE_FN<Value>(params),
  ] as const;
}
