import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { StrategyName } from "../interfaces/Strategy.interface";

const STOP_METHOD_NAME = "strategy.stop";
const CANCEL_METHOD_NAME = "strategy.cancel";

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

/**
 * Cancels the scheduled signal without stopping the strategy.
 *
 * Clears the scheduled signal (waiting for priceOpen activation).
 * Does NOT affect active pending signals or strategy operation.
 * Does NOT set stop flag - strategy can continue generating new signals.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param strategyName - Strategy name
 * @param cancelId - Optional cancellation ID for tracking user-initiated cancellations
 * @returns Promise that resolves when scheduled signal is cancelled
 *
 * @example
 * ```typescript
 * import { cancel } from "backtest-kit";
 *
 * // Cancel scheduled signal with custom ID
 * await cancel("BTCUSDT", "my-strategy", "manual-cancel-001");
 * ```
 */
export async function cancel(symbol: string, cancelId?: string): Promise<void> {
  backtest.loggerService.info(CANCEL_METHOD_NAME, {
    symbol,
    cancelId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("cancel requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("cancel requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  await backtest.strategyCoreService.cancel(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
    cancelId
  );
}

export default { stop, cancel };
