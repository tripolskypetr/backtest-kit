import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";

const STOP_METHOD_NAME = "control.stop";

/**
 * Stops the strategy from generating new signals.
 *
 * Sets internal flag to prevent strategy from opening new signals.
 * Current active signal (if any) will complete normally.
 * Backtest/Live mode will stop at the next safe point (idle state or after signal closes).
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param strategyName - Strategy name to stop
 * @returns Promise that resolves when stop flag is set
 *
 * @example
 * ```typescript
 * import { stop } from "backtest-kit";
 *
 * // Stop strategy after some condition
 * await stop("BTCUSDT", "my-strategy");
 * ```
 */
export async function stop(symbol: string): Promise<void> {
  backtest.loggerService.info(STOP_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("stop requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("stop requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  await backtest.strategyCoreService.stop(isBacktest, symbol, {
    exchangeName,
    frameName,
    strategyName,
  });
}
