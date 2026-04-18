import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { Recent } from "../classes/Recent";
import { IPublicSignalRow } from "../interfaces/Strategy.interface";

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
  const { when } = backtest.executionContextService.context;
  return await Recent.getMinutesSinceLatestSignalCreated(
    when.getTime(),
    symbol,
    { exchangeName, frameName, strategyName },
  );
}
