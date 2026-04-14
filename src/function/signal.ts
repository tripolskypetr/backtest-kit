import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { Recent } from "../classes/Recent";
import { IPublicSignalRow } from "../interfaces/Strategy.interface";

const GET_LATEST_SIGNAL_METHOD_NAME = "signal.getLatestSignal";

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
