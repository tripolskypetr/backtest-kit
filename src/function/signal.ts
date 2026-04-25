import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { Recent } from "../classes/Recent";
import { IPublicSignalRow, IScheduledSignalRow } from "../interfaces/Strategy.interface";
import { State } from "../classes/State";

type Dispatch<Value extends object = object> = (value: Value) => Value | Promise<Value>;

const GET_SIGNAL_STATE_METHOD_NAME = "signal.getSignalState";
const SET_SIGNAL_STATE_METHOD_NAME = "signal.setSignalState";

const GET_LATEST_SIGNAL_METHOD_NAME = "signal.getLatestSignal";
const GET_MINUTES_SINCE_LATEST_SIGNAL_CREATED_METHOD_NAME = "signal.getMinutesSinceLatestSignalCreated";

/**
 * Returns the latest signal (pending or closed) for the current strategy context.
 *
 * Does not distinguish between active and closed signals — returns whichever
 * was recorded last. Useful for cooldown logic: e.g. skip opening a new position
 * for 4 hours after a stop-loss by checking the timestamp of the latest signal
 * regardless of its outcome.
 *
 * Searches backtest storage first, then live storage.
 * Returns null if no signal exists at all.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to the latest signal or null
 *
 * @example
 * ```typescript
 * import { getLatestSignal } from "backtest-kit";
 *
 * const latest = await getLatestSignal("BTCUSDT");
 * if (latest && Date.now() - latest.closedAt < 4 * 60 * 60 * 1000) {
 *   return; // cooldown after SL — skip new signal for 4 hours
 * }
 * ```
 */
export async function getLatestSignal(
  symbol: string,
): Promise<IPublicSignalRow | null> {
  backtest.loggerService.info(GET_LATEST_SIGNAL_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getLatestSignal requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getLatestSignal requires a method context");
  }
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await Recent.getLatestSignal(
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the number of whole minutes elapsed since the latest signal's creation timestamp.
 *
 * Does not distinguish between active and closed signals — measures time since
 * whichever signal was recorded last. Useful for cooldown logic after a stop-loss.
 *
 * Searches backtest storage first, then live storage.
 * Returns null if no signal exists at all.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param timestamp - Current timestamp in milliseconds
 * @returns Promise resolving to whole minutes since the latest signal was created, or null
 *
 * @example
 * ```typescript
 * import { getMinutesSinceLatestSignalCreated } from "backtest-kit";
 *
 * const minutes = await getMinutesSinceLatestSignalCreated("BTCUSDT");
 * if (minutes !== null && minutes < 24 * 60) {
 *   return; // cooldown — skip new signal for 24 hours after last signal
 * }
 * ```
 */
export async function getMinutesSinceLatestSignalCreated(
  symbol: string,
): Promise<number | null> {
  backtest.loggerService.info(GET_MINUTES_SINCE_LATEST_SIGNAL_CREATED_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getMinutesSinceLatestSignalCreated requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getMinutesSinceLatestSignalCreated requires a method context");
  }
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await Recent.getMinutesSinceLatestSignalCreated(
    symbol,
    { exchangeName, frameName, strategyName },
  );
}


/**
 * Reads the state value scoped to the current active signal.
 *
 * Resolves the active pending signal automatically from execution context.
 * If no pending signal exists, logs a warning and returns the initialValue.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * Intended for LLM-driven capitulation strategies that accumulate per-trade
 * metrics (e.g. peakPercent, minutesOpen) across onActivePing ticks.
 * Profitable trades endure -0.5–2.5% drawdown and reach peak 2–3%+.
 * SL trades show peak < 0.15% (Feb08, Feb13) or never go positive (Feb25).
 * Rule: if minutesOpen >= N and peakPercent < threshold (e.g. 0.3%) — exit.
 *
 * @param dto.bucketName - State bucket name
 * @param dto.initialValue - Default value when no persisted state exists
 * @returns Promise resolving to current state value, or initialValue if no signal
 *
 * @deprecated Better use State.getState with manual signalId argument
 *
 * @example
 * ```typescript
 * import { getSignalState } from "backtest-kit";
 *
 * const { peakPercent, minutesOpen } = await getSignalState({
 *   bucketName: "trade",
 *   initialValue: { peakPercent: 0, minutesOpen: 0 },
 * });
 * if (minutesOpen >= 15 && peakPercent < 0.3) {
 *   await commitMarketClose(symbol); // capitulate — LLM thesis not confirmed
 * }
 * ```
 */
export async function getSignalState<Value extends object = object>(dto: {
  bucketName: string;
  initialValue: Value;
}): Promise<Value> {
  const { bucketName, initialValue } = dto;
  backtest.loggerService.info(GET_SIGNAL_STATE_METHOD_NAME, { bucketName });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getSignalState requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getSignalState requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    return await State.getState<Value>({
      signalId: signal.id,
      bucketName,
      initialValue,
      backtest: isBacktest,
    });
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    return await State.getState<Value>({
      signalId: signal.id,
      bucketName,
      initialValue,
      backtest: isBacktest,
    });
  }
  throw new Error(`getSignalState requires a pending or scheduled signal for symbol=${symbol} bucketName=${bucketName}`);
}

/**
 * Updates the state value scoped to the current active signal.
 *
 * Resolves the active pending signal automatically from execution context.
 * If no pending signal exists, logs a warning and returns without writing.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * Intended for LLM-driven capitulation strategies that accumulate per-trade
 * metrics (e.g. peakPercent, minutesOpen) across onActivePing ticks.
 * Profitable trades endure -0.5–2.5% drawdown and reach peak 2–3%+.
 * SL trades show peak < 0.15% (Feb08, Feb13) or never go positive (Feb25).
 * Rule: if minutesOpen >= N and peakPercent < threshold (e.g. 0.3%) — exit.
 *
 * @param dto.bucketName - State bucket name
 * @param dto.initialValue - Default value when no persisted state exists
 * @param dto.dispatch - New value or updater function receiving current value
 * @returns Promise resolving to updated state value, or initialValue if no signal
 *
 * @deprecated Better use State.setState with manual signalId argument
 *
 * @example
 * ```typescript
 * import { setSignalState } from "backtest-kit";
 *
 * await setSignalState(
 *   dispatch: (s) => ({
 *     peakPercent: Math.max(s.peakPercent, currentUnrealisedPercent),
 *     minutesOpen: s.minutesOpen + 1,
 *   }),
 *   {
 *     bucketName: "trade",
 *     initialValue: { peakPercent: 0, minutesOpen: 0 },
 *   }
 * );
 * ```
 */
export async function setSignalState<Value extends object = object>(
  dispatch: Value | Dispatch<Value>,
  dto: { 
    bucketName: string;
    initialValue: Value;
  },
): Promise<Value> {
  const { bucketName, initialValue } = dto;
  backtest.loggerService.info(SET_SIGNAL_STATE_METHOD_NAME, { bucketName });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("setSignalState requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("setSignalState requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    return await State.setState<Value>(dispatch, {
      signalId: signal.id,
      bucketName,
      initialValue,
      backtest: isBacktest,
    });
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    return await State.setState<Value>(dispatch, {
      signalId: signal.id,
      bucketName,
      initialValue,
      backtest: isBacktest,
    });
  }
  throw new Error(`setSignalState requires a pending or scheduled signal for symbol=${symbol} bucketName=${bucketName}`);
}

