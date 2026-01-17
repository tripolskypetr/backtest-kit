import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { getAveragePrice } from "./exchange";

const STOP_METHOD_NAME = "strategy.commitStop";
const CANCEL_METHOD_NAME = "strategy.commitCancel";
const PARTIAL_PROFIT_METHOD_NAME = "strategy.commitPartialProfit";
const PARTIAL_LOSS_METHOD_NAME = "strategy.commitPartialLoss";
const TRAILING_STOP_METHOD_NAME = "strategy.commitTrailingStop";
const TRAILING_PROFIT_METHOD_NAME = "strategy.commitTrailingTake";
const BREAKEVEN_METHOD_NAME = "strategy.commitBreakeven";

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
export async function commitStop(symbol: string): Promise<void> {
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
export async function commitCancel(symbol: string, cancelId?: string): Promise<void> {
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

/**
 * Executes partial close at profit level (moving toward TP).
 *
 * Closes a percentage of the active pending position at profit.
 * Price must be moving toward take profit (in profit direction).
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param percentToClose - Percentage of position to close (0-100, absolute value)
 * @returns Promise<boolean> - true if partial close executed, false if skipped
 *
 * @throws Error if currentPrice is not in profit direction:
 *   - LONG: currentPrice must be > priceOpen
 *   - SHORT: currentPrice must be < priceOpen
 *
 * @example
 * ```typescript
 * import { partialProfit } from "backtest-kit";
 *
 * // Close 30% of LONG position at profit
 * const success = await partialProfit("BTCUSDT", 30);
 * if (success) {
 *   console.log('Partial profit executed');
 * }
 * ```
 */
export async function commitPartialProfit(
  symbol: string,
  percentToClose: number,
): Promise<boolean> {
  backtest.loggerService.info(PARTIAL_PROFIT_METHOD_NAME, {
    symbol,
    percentToClose,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("partialProfit requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("partialProfit requires a method context");
  }
  const currentPrice = await getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.partialProfit(
    isBacktest,
    symbol,
    percentToClose,
    currentPrice,
    { exchangeName, frameName, strategyName }
  );
}

/**
 * Executes partial close at loss level (moving toward SL).
 *
 * Closes a percentage of the active pending position at loss.
 * Price must be moving toward stop loss (in loss direction).
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param percentToClose - Percentage of position to close (0-100, absolute value)
 * @returns Promise<boolean> - true if partial close executed, false if skipped
 *
 * @throws Error if currentPrice is not in loss direction:
 *   - LONG: currentPrice must be < priceOpen
 *   - SHORT: currentPrice must be > priceOpen
 *
 * @example
 * ```typescript
 * import { partialLoss } from "backtest-kit";
 *
 * // Close 40% of LONG position at loss
 * const success = await partialLoss("BTCUSDT", 40);
 * if (success) {
 *   console.log('Partial loss executed');
 * }
 * ```
 */
export async function commitPartialLoss(
  symbol: string,
  percentToClose: number,
): Promise<boolean> {
  backtest.loggerService.info(PARTIAL_LOSS_METHOD_NAME, {
    symbol,
    percentToClose,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("partialLoss requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("partialLoss requires a method context");
  }
  const currentPrice = await getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.partialLoss(
    isBacktest,
    symbol,
    percentToClose,
    currentPrice,
    { exchangeName, frameName, strategyName }
  );
}

/**
 * Adjusts the trailing stop-loss distance for an active pending signal.
 *
 * CRITICAL: Always calculates from ORIGINAL SL, not from current trailing SL.
 * This prevents error accumulation on repeated calls.
 * Larger percentShift ABSORBS smaller one (updates only towards better protection).
 *
 * Updates the stop-loss distance by a percentage adjustment relative to the ORIGINAL SL distance.
 * Negative percentShift tightens the SL (reduces distance, moves closer to entry).
 * Positive percentShift loosens the SL (increases distance, moves away from entry).
 *
 * Absorption behavior:
 * - First call: sets trailing SL unconditionally
 * - Subsequent calls: updates only if new SL is BETTER (protects more profit)
 * - For LONG: only accepts HIGHER SL (never moves down, closer to entry wins)
 * - For SHORT: only accepts LOWER SL (never moves up, closer to entry wins)
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param percentShift - Percentage adjustment to ORIGINAL SL distance (-100 to 100)
 * @param currentPrice - Current market price to check for intrusion
 * @returns Promise<boolean> - true if trailing SL was set/updated, false if rejected (absorption/intrusion/conflict)
 *
 * @example
 * ```typescript
 * import { trailingStop } from "backtest-kit";
 *
 * // LONG: entry=100, originalSL=90, distance=10%, currentPrice=102
 *
 * // First call: tighten by 5%
 * const success1 = await trailingStop("BTCUSDT", -5, 102);
 * // success1 = true, newDistance = 10% - 5% = 5%, newSL = 95
 *
 * // Second call: try weaker protection (smaller percentShift)
 * const success2 = await trailingStop("BTCUSDT", -3, 102);
 * // success2 = false (SKIPPED: newSL=97 < 95, worse protection, larger % absorbs smaller)
 *
 * // Third call: stronger protection (larger percentShift)
 * const success3 = await trailingStop("BTCUSDT", -7, 102);
 * // success3 = true (ACCEPTED: newDistance = 10% - 7% = 3%, newSL = 97 > 95, better protection)
 * ```
 */
export async function commitTrailingStop(
  symbol: string,
  percentShift: number,
  currentPrice: number,
): Promise<boolean> {
  backtest.loggerService.info(TRAILING_STOP_METHOD_NAME, {
    symbol,
    percentShift,
    currentPrice,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("trailingStop requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("trailingStop requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.trailingStop(
    isBacktest,
    symbol,
    percentShift,
    currentPrice,
    { exchangeName, frameName, strategyName }
  );
}

/**
 * Adjusts the trailing take-profit distance for an active pending signal.
 *
 * CRITICAL: Always calculates from ORIGINAL TP, not from current trailing TP.
 * This prevents error accumulation on repeated calls.
 * Larger percentShift ABSORBS smaller one (updates only towards more conservative TP).
 *
 * Updates the take-profit distance by a percentage adjustment relative to the ORIGINAL TP distance.
 * Negative percentShift brings TP closer to entry (more conservative).
 * Positive percentShift moves TP further from entry (more aggressive).
 *
 * Absorption behavior:
 * - First call: sets trailing TP unconditionally
 * - Subsequent calls: updates only if new TP is MORE CONSERVATIVE (closer to entry)
 * - For LONG: only accepts LOWER TP (never moves up, closer to entry wins)
 * - For SHORT: only accepts HIGHER TP (never moves down, closer to entry wins)
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param percentShift - Percentage adjustment to ORIGINAL TP distance (-100 to 100)
 * @param currentPrice - Current market price to check for intrusion
 * @returns Promise<boolean> - true if trailing TP was set/updated, false if rejected (absorption/intrusion/conflict)
 *
 * @example
 * ```typescript
 * import { trailingTake } from "backtest-kit";
 *
 * // LONG: entry=100, originalTP=110, distance=10%, currentPrice=102
 *
 * // First call: bring TP closer by 3%
 * const success1 = await trailingTake("BTCUSDT", -3, 102);
 * // success1 = true, newDistance = 10% - 3% = 7%, newTP = 107
 *
 * // Second call: try to move TP further (less conservative)
 * const success2 = await trailingTake("BTCUSDT", 2, 102);
 * // success2 = false (SKIPPED: newTP=112 > 107, less conservative, larger % absorbs smaller)
 *
 * // Third call: even more conservative
 * const success3 = await trailingTake("BTCUSDT", -5, 102);
 * // success3 = true (ACCEPTED: newDistance = 10% - 5% = 5%, newTP = 105 < 107, more conservative)
 * ```
 */
export async function commitTrailingTake(
  symbol: string,
  percentShift: number,
  currentPrice: number,
): Promise<boolean> {
  backtest.loggerService.info(TRAILING_PROFIT_METHOD_NAME, {
    symbol,
    percentShift,
    currentPrice,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("trailingTake requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("trailingTake requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.trailingTake(
    isBacktest,
    symbol,
    percentShift,
    currentPrice,
    { exchangeName, frameName, strategyName }
  );
}

/**
 * Moves stop-loss to breakeven when price reaches threshold.
 *
 * Moves SL to entry price (zero-risk position) when current price has moved
 * far enough in profit direction to cover transaction costs.
 * Threshold is calculated as: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2
 *
 * Automatically detects backtest/live mode from execution context.
 * Automatically fetches current price via getAveragePrice.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise<boolean> - true if breakeven was set, false if conditions not met
 *
 * @example
 * ```typescript
 * import { breakeven } from "backtest-kit";
 *
 * // LONG: entry=100, slippage=0.1%, fee=0.1%, threshold=0.4%
 * // Try to move SL to breakeven (activates when price >= 100.4)
 * const moved = await breakeven("BTCUSDT");
 * if (moved) {
 *   console.log("Position moved to breakeven!");
 * }
 * ```
 */
export async function commitBreakeven(symbol: string): Promise<boolean> {
  backtest.loggerService.info(BREAKEVEN_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("breakeven requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("breakeven requires a method context");
  }
  const currentPrice = await getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.breakeven(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName }
  );
}
