import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { getAveragePrice } from "./exchange";
import { investedCostToPercent } from "../math/investedCostToPercent";
import { slPriceToPercentShift } from "../math/slPriceToPercentShift";
import { tpPriceToPercentShift } from "../math/tpPriceToPercentShift";
import { slPercentShiftToPrice } from "../math/slPercentShiftToPrice";
import { tpPercentShiftToPrice } from "../math/tpPercentShiftToPrice";
import { percentToCloseCost } from "../math/percentToCloseCost";
import { breakevenNewStopLossPrice } from "../math/breakevenNewStopLossPrice";
import { breakevenNewTakeProfitPrice } from "../math/breakevenNewTakeProfitPrice";
import { Broker } from "../classes/Broker";
import { GLOBAL_CONFIG } from "../config/params";
import { not } from "functools-kit";
import { IPositionOverlapLadder, POSITION_OVERLAP_LADDER_DEFAULT } from "../config/ladder";
import { IPublicSignalRow } from "../interfaces/Strategy.interface";

const CANCEL_SCHEDULED_METHOD_NAME = "strategy.commitCancelScheduled";
const CLOSE_PENDING_METHOD_NAME = "strategy.commitClosePending";
const PARTIAL_PROFIT_METHOD_NAME = "strategy.commitPartialProfit";
const PARTIAL_LOSS_METHOD_NAME = "strategy.commitPartialLoss";
const PARTIAL_PROFIT_COST_METHOD_NAME = "strategy.commitPartialProfitCost";
const PARTIAL_LOSS_COST_METHOD_NAME = "strategy.commitPartialLossCost";
const TRAILING_STOP_METHOD_NAME = "strategy.commitTrailingStop";
const TRAILING_PROFIT_METHOD_NAME = "strategy.commitTrailingTake";
const TRAILING_STOP_COST_METHOD_NAME = "strategy.commitTrailingStopCost";
const TRAILING_PROFIT_COST_METHOD_NAME = "strategy.commitTrailingTakeCost";
const BREAKEVEN_METHOD_NAME = "strategy.commitBreakeven";
const ACTIVATE_SCHEDULED_METHOD_NAME = "strategy.commitActivateScheduled";
const AVERAGE_BUY_METHOD_NAME = "strategy.commitAverageBuy";
const GET_TOTAL_PERCENT_CLOSED_METHOD_NAME = "strategy.getTotalPercentClosed";
const GET_TOTAL_COST_CLOSED_METHOD_NAME = "strategy.getTotalCostClosed";
const GET_PENDING_SIGNAL_METHOD_NAME = "strategy.getPendingSignal";
const GET_SCHEDULED_SIGNAL_METHOD_NAME = "strategy.getScheduledSignal";
const GET_BREAKEVEN_METHOD_NAME = "strategy.getBreakeven";
const GET_POSITION_AVERAGE_PRICE_METHOD_NAME =
  "strategy.getPositionEffectivePrice";
const GET_POSITION_INVESTED_COUNT_METHOD_NAME =
  "strategy.getPositionInvestedCount";
const GET_POSITION_INVESTED_COST_METHOD_NAME =
  "strategy.getPositionInvestedCost";
const GET_POSITION_PNL_PERCENT_METHOD_NAME = "strategy.getPositionPnlPercent";
const GET_POSITION_PNL_COST_METHOD_NAME = "strategy.getPositionPnlCost";
const GET_POSITION_LEVELS_METHOD_NAME = "strategy.getPositionLevels";
const GET_POSITION_PARTIALS_METHOD_NAME = "strategy.getPositionPartials";
const GET_POSITION_ENTRIES_METHOD_NAME = "strategy.getPositionEntries";
const GET_POSITION_ESTIMATE_MINUTES_METHOD_NAME = "strategy.getPositionEstimateMinutes";
const GET_POSITION_COUNTDOWN_MINUTES_METHOD_NAME = "strategy.getPositionCountdownMinutes";
const GET_POSITION_HIGHEST_PROFIT_PRICE_METHOD_NAME = "strategy.getPositionHighestProfitPrice";
const GET_POSITION_HIGHEST_PROFIT_TIMESTAMP_METHOD_NAME = "strategy.getPositionHighestProfitTimestamp";
const GET_POSITION_HIGHEST_PNL_PERCENTAGE_METHOD_NAME = "strategy.getPositionHighestPnlPercentage";
const GET_POSITION_HIGHEST_PNL_COST_METHOD_NAME = "strategy.getPositionHighestPnlCost";
const GET_POSITION_HIGHEST_PROFIT_BREAKEVEN_METHOD_NAME = "strategy.getPositionHighestProfitBreakeven";
const GET_POSITION_DRAWDOWN_MINUTES_METHOD_NAME = "strategy.getPositionDrawdownMinutes";
const GET_POSITION_ENTRY_OVERLAP_METHOD_NAME = "strategy.getPositionEntryOverlap";
const GET_POSITION_PARTIAL_OVERLAP_METHOD_NAME = "strategy.getPositionPartialOverlap";
const HAS_NO_PENDING_SIGNAL_METHOD_NAME = "strategy.hasNoPendingSignal";
const HAS_NO_SCHEDULED_SIGNAL_METHOD_NAME = "strategy.hasNoScheduledSignal";

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
 * import { commitCancelScheduled } from "backtest-kit";
 *
 * // Cancel scheduled signal with custom ID
 * await commitCancelScheduled("BTCUSDT", "manual-cancel-001");
 * ```
 */
export async function commitCancelScheduled(
  symbol: string,
  cancelId?: string,
): Promise<void> {
  backtest.loggerService.info(CANCEL_SCHEDULED_METHOD_NAME, {
    symbol,
    cancelId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("commitCancelScheduled requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("commitCancelScheduled requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  await backtest.strategyCoreService.cancelScheduled(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
    cancelId,
  );
}

/**
 * Closes the pending signal without stopping the strategy.
 *
 * Clears the pending signal (active position).
 * Does NOT affect scheduled signals or strategy operation.
 * Does NOT set stop flag - strategy can continue generating new signals.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param closeId - Optional close ID for tracking user-initiated closes
 * @returns Promise that resolves when pending signal is closed
 *
 * @example
 * ```typescript
 * import { commitClosePending } from "backtest-kit";
 *
 * // Close pending signal with custom ID
 * await commitClosePending("BTCUSDT", "manual-close-001");
 * ```
 */
export async function commitClosePending(
  symbol: string,
  closeId?: string,
): Promise<void> {
  backtest.loggerService.info(CLOSE_PENDING_METHOD_NAME, {
    symbol,
    closeId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("commitClosePending requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("commitClosePending requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;

  await backtest.strategyCoreService.closePending(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
    closeId,
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
  const investedCostForProfit =
    await backtest.strategyCoreService.getPositionInvestedCost(
      isBacktest,
      symbol,
      { exchangeName, frameName, strategyName },
    );
  if (investedCostForProfit === null) {
    return false;
  }
  const signalForProfit = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signalForProfit) {
    return false;
  }
  if (
    await not(
      backtest.strategyCoreService.validatePartialProfit(
        isBacktest,
        symbol,
        percentToClose,
        currentPrice,
        { exchangeName, frameName, strategyName },
      ),
    )
  ) {
    return false;
  }
  await Broker.commitPartialProfit({
    symbol,
    percentToClose,
    cost: percentToCloseCost(percentToClose, investedCostForProfit),
    currentPrice,
    position: signalForProfit.position,
    priceTakeProfit: signalForProfit.priceTakeProfit,
    priceStopLoss: signalForProfit.priceStopLoss,
    context: { exchangeName, frameName, strategyName },
    backtest: isBacktest,
  });
  return await backtest.strategyCoreService.partialProfit(
    isBacktest,
    symbol,
    percentToClose,
    currentPrice,
    { exchangeName, frameName, strategyName },
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
  const investedCostForLoss =
    await backtest.strategyCoreService.getPositionInvestedCost(
      isBacktest,
      symbol,
      { exchangeName, frameName, strategyName },
    );
  if (investedCostForLoss === null) {
    return false;
  }
  const signalForLoss = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signalForLoss) {
    return false;
  }
  if (
    await not(
      backtest.strategyCoreService.validatePartialLoss(
        isBacktest,
        symbol,
        percentToClose,
        currentPrice,
        { exchangeName, frameName, strategyName },
      ),
    )
  ) {
    return false;
  }
  await Broker.commitPartialLoss({
    symbol,
    percentToClose,
    cost: percentToCloseCost(percentToClose, investedCostForLoss),
    currentPrice,
    position: signalForLoss.position,
    priceTakeProfit: signalForLoss.priceTakeProfit,
    priceStopLoss: signalForLoss.priceStopLoss,
    context: { exchangeName, frameName, strategyName },
    backtest: isBacktest,
  });
  return await backtest.strategyCoreService.partialLoss(
    isBacktest,
    symbol,
    percentToClose,
    currentPrice,
    { exchangeName, frameName, strategyName },
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
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    return false;
  }
  const effectivePriceOpen =
    await backtest.strategyCoreService.getPositionEffectivePrice(
      isBacktest,
      symbol,
      { exchangeName, frameName, strategyName },
    );
  if (effectivePriceOpen === null) {
    return false;
  }
  if (
    await not(
      backtest.strategyCoreService.validateTrailingStop(
        isBacktest,
        symbol,
        percentShift,
        currentPrice,
        { exchangeName, frameName, strategyName },
      ),
    )
  ) {
    return false;
  }
  await Broker.commitTrailingStop({
    symbol,
    percentShift,
    currentPrice,
    newStopLossPrice: slPercentShiftToPrice(
      percentShift,
      signal.priceStopLoss,
      effectivePriceOpen,
      signal.position,
    ),
    takeProfitPrice: signal.priceTakeProfit,
    position: signal.position,
    context: { exchangeName, frameName, strategyName },
    backtest: isBacktest,
  });
  return await backtest.strategyCoreService.trailingStop(
    isBacktest,
    symbol,
    percentShift,
    currentPrice,
    { exchangeName, frameName, strategyName },
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
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    return false;
  }
  const effectivePriceOpen =
    await backtest.strategyCoreService.getPositionEffectivePrice(
      isBacktest,
      symbol,
      { exchangeName, frameName, strategyName },
    );
  if (effectivePriceOpen === null) {
    return false;
  }
  if (
    await not(
      backtest.strategyCoreService.validateTrailingTake(
        isBacktest,
        symbol,
        percentShift,
        currentPrice,
        { exchangeName, frameName, strategyName },
      ),
    )
  ) {
    return false;
  }
  await Broker.commitTrailingTake({
    symbol,
    percentShift,
    currentPrice,
    newTakeProfitPrice: tpPercentShiftToPrice(
      percentShift,
      signal.priceTakeProfit,
      effectivePriceOpen,
      signal.position,
    ),
    takeProfitPrice: signal.priceTakeProfit,
    position: signal.position,
    context: { exchangeName, frameName, strategyName },
    backtest: isBacktest,
  });
  return await backtest.strategyCoreService.trailingTake(
    isBacktest,
    symbol,
    percentShift,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Adjusts the trailing stop-loss to an absolute price level.
 *
 * Convenience wrapper around commitTrailingStop that converts an absolute
 * stop-loss price to a percentShift relative to the ORIGINAL SL distance.
 *
 * Automatically detects backtest/live mode from execution context.
 * Automatically fetches current price via getAveragePrice.
 *
 * @param symbol - Trading pair symbol
 * @param newStopLossPrice - Desired absolute stop-loss price
 * @returns Promise<boolean> - true if trailing SL was set/updated, false if rejected
 */
export async function commitTrailingStopCost(
  symbol: string,
  newStopLossPrice: number,
): Promise<boolean> {
  backtest.loggerService.info(TRAILING_STOP_COST_METHOD_NAME, {
    symbol,
    newStopLossPrice,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("commitTrailingStopCost requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("commitTrailingStopCost requires a method context");
  }
  const currentPrice = await getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    return false;
  }
  const effectivePriceOpen =
    await backtest.strategyCoreService.getPositionEffectivePrice(
      isBacktest,
      symbol,
      { exchangeName, frameName, strategyName },
    );
  if (effectivePriceOpen === null) {
    return false;
  }
  const percentShift = slPriceToPercentShift(
    newStopLossPrice,
    signal.priceStopLoss,
    effectivePriceOpen,
  );
  if (
    await not(
      backtest.strategyCoreService.validateTrailingStop(
        isBacktest,
        symbol,
        percentShift,
        currentPrice,
        { exchangeName, frameName, strategyName },
      ),
    )
  ) {
    return false;
  }
  await Broker.commitTrailingStop({
    symbol,
    percentShift,
    currentPrice,
    newStopLossPrice,
    position: signal.position,
    takeProfitPrice: signal.priceTakeProfit,
    context: { exchangeName, frameName, strategyName },
    backtest: isBacktest,
  });
  return await backtest.strategyCoreService.trailingStop(
    isBacktest,
    symbol,
    percentShift,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Adjusts the trailing take-profit to an absolute price level.
 *
 * Convenience wrapper around commitTrailingTake that converts an absolute
 * take-profit price to a percentShift relative to the ORIGINAL TP distance.
 *
 * Automatically detects backtest/live mode from execution context.
 * Automatically fetches current price via getAveragePrice.
 *
 * @param symbol - Trading pair symbol
 * @param newTakeProfitPrice - Desired absolute take-profit price
 * @returns Promise<boolean> - true if trailing TP was set/updated, false if rejected
 */
export async function commitTrailingTakeCost(
  symbol: string,
  newTakeProfitPrice: number,
): Promise<boolean> {
  backtest.loggerService.info(TRAILING_PROFIT_COST_METHOD_NAME, {
    symbol,
    newTakeProfitPrice,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("commitTrailingTakeCost requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("commitTrailingTakeCost requires a method context");
  }
  const currentPrice = await getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    return false;
  }
  const effectivePriceOpen =
    await backtest.strategyCoreService.getPositionEffectivePrice(
      isBacktest,
      symbol,
      { exchangeName, frameName, strategyName },
    );
  if (effectivePriceOpen === null) {
    return false;
  }
  const percentShift = tpPriceToPercentShift(
    newTakeProfitPrice,
    signal.priceTakeProfit,
    effectivePriceOpen,
  );
  if (
    await not(
      backtest.strategyCoreService.validateTrailingTake(
        isBacktest,
        symbol,
        percentShift,
        currentPrice,
        { exchangeName, frameName, strategyName },
      ),
    )
  ) {
    return false;
  }
  await Broker.commitTrailingTake({
    symbol,
    percentShift,
    currentPrice,
    newTakeProfitPrice,
    takeProfitPrice: signal.priceTakeProfit,
    position: signal.position,
    context: { exchangeName, frameName, strategyName },
    backtest: isBacktest,
  });
  return await backtest.strategyCoreService.trailingTake(
    isBacktest,
    symbol,
    percentShift,
    currentPrice,
    { exchangeName, frameName, strategyName },
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
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    return false;
  }
  const effectivePriceOpen = await backtest.strategyCoreService.getPositionEffectivePrice(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
  if (effectivePriceOpen === null) {
    return false;
  }
  if (
    await not(
      backtest.strategyCoreService.validateBreakeven(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      ),
    )
  ) {
    return false;
  }
  await Broker.commitBreakeven({
    symbol,
    currentPrice,
    newStopLossPrice: breakevenNewStopLossPrice(effectivePriceOpen),
    newTakeProfitPrice: breakevenNewTakeProfitPrice(signal.priceTakeProfit, signal._trailingPriceTakeProfit),
    position: signal.position,
    context: { exchangeName, frameName, strategyName },
    backtest: isBacktest,
  });
  return await backtest.strategyCoreService.breakeven(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Activates a scheduled signal early without waiting for price to reach priceOpen.
 *
 * Sets the activation flag on the scheduled signal. The actual activation
 * happens on the next tick() when strategy detects the flag.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param activateId - Optional activation ID for tracking user-initiated activations
 * @returns Promise that resolves when activation flag is set
 *
 * @example
 * ```typescript
 * import { commitActivateScheduled } from "backtest-kit";
 *
 * // Activate scheduled signal early with custom ID
 * await commitActivateScheduled("BTCUSDT", "manual-activate-001");
 * ```
 */
export async function commitActivateScheduled(
  symbol: string,
  activateId?: string,
): Promise<void> {
  backtest.loggerService.info(ACTIVATE_SCHEDULED_METHOD_NAME, {
    symbol,
    activateId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("commitActivateScheduled requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("commitActivateScheduled requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  await backtest.strategyCoreService.activateScheduled(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
    activateId,
  );
}

/**
 * Adds a new DCA entry to the active pending signal.
 *
 * Adds a new averaging entry at the current market price to the position's
 * entry history. Updates effectivePriceOpen (mean of all entries) and emits
 * an average-buy commit event.
 *
 * Automatically detects backtest/live mode from execution context.
 * Automatically fetches current price via getAveragePrice.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise<boolean> - true if entry added, false if rejected
 *
 * @example
 * ```typescript
 * import { commitAverageBuy } from "backtest-kit";
 *
 * // Add DCA entry at current market price
 * const success = await commitAverageBuy("BTCUSDT");
 * if (success) {
 *   console.log("DCA entry added");
 * }
 * ```
 */
export async function commitAverageBuy(
  symbol: string,
  cost: number = GLOBAL_CONFIG.CC_POSITION_ENTRY_COST,
): Promise<boolean> {
  backtest.loggerService.info(AVERAGE_BUY_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("commitAverageBuy requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("commitAverageBuy requires a method context");
  }
  const currentPrice = await getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  if (
    await not(
      backtest.strategyCoreService.validateAverageBuy(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      ),
    )
  ) {
    return false;
  }
  const signalForAvgBuy = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signalForAvgBuy) {
    return false;
  }
  await Broker.commitAverageBuy({
    symbol,
    currentPrice,
    cost,
    position: signalForAvgBuy.position,
    priceTakeProfit: signalForAvgBuy.priceTakeProfit,
    priceStopLoss: signalForAvgBuy.priceStopLoss,
    context: { exchangeName, frameName, strategyName },
    backtest: isBacktest,
  });
  return await backtest.strategyCoreService.averageBuy(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
    cost,
  );
}

/**
 * Returns the percentage of the position currently held (not closed).
 * 100 = nothing has been closed (full position), 0 = fully closed.
 * Correctly accounts for DCA entries between partial closes.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise<number> - held percentage (0–100)
 *
 * @example
 * ```typescript
 * import { getTotalPercentClosed } from "backtest-kit";
 *
 * const heldPct = await getTotalPercentClosed("BTCUSDT");
 * console.log(`Holding ${heldPct}% of position`);
 * ```
 */
export async function getTotalPercentClosed(symbol: string): Promise<number> {
  backtest.loggerService.info(GET_TOTAL_PERCENT_CLOSED_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getTotalPercentClosed requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getTotalPercentClosed requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getTotalPercentClosed(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the cost basis in dollars of the position currently held (not closed).
 * Correctly accounts for DCA entries between partial closes.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise<number> - held cost basis in dollars
 *
 * @example
 * ```typescript
 * import { getTotalCostClosed } from "backtest-kit";
 *
 * const heldCost = await getTotalCostClosed("BTCUSDT");
 * console.log(`Holding $${heldCost} of position`);
 * ```
 */
export async function getTotalCostClosed(symbol: string): Promise<number> {
  backtest.loggerService.info(GET_TOTAL_COST_CLOSED_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getTotalCostClosed requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getTotalCostClosed requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getTotalCostClosed(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the currently active pending signal for the strategy.
 * If no active signal exists, returns null.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to pending signal or null
 *
 * @example
 * ```typescript
 * import { getPendingSignal } from "backtest-kit";
 *
 * const pending = await getPendingSignal("BTCUSDT");
 * if (pending) {
 *   console.log("Active signal:", pending.id);
 * }
 * ```
 */
export async function getPendingSignal(symbol: string): Promise<IPublicSignalRow | null>  {
  backtest.loggerService.info(GET_PENDING_SIGNAL_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPendingSignal requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPendingSignal requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  return await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the currently active scheduled signal for the strategy.
 * If no scheduled signal exists, returns null.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to scheduled signal or null
 *
 * @example
 * ```typescript
 * import { getScheduledSignal } from "backtest-kit";
 *
 * const scheduled = await getScheduledSignal("BTCUSDT");
 * if (scheduled) {
 *   console.log("Scheduled signal:", scheduled.id);
 * }
 * ```
 */
export async function getScheduledSignal(symbol: string) {
  backtest.loggerService.info(GET_SCHEDULED_SIGNAL_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getScheduledSignal requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getScheduledSignal requires a method context");
  }
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getScheduledSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Checks if breakeven threshold has been reached for the current pending signal.
 *
 * Returns true if price has moved far enough in profit direction to cover
 * transaction costs. Threshold is calculated as: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param currentPrice - Current market price to check against threshold
 * @returns Promise<boolean> - true if breakeven threshold reached, false otherwise
 *
 * @example
 * ```typescript
 * import { getBreakeven, getAveragePrice } from "backtest-kit";
 *
 * const price = await getAveragePrice("BTCUSDT");
 * const canBreakeven = await getBreakeven("BTCUSDT", price);
 * if (canBreakeven) {
 *   console.log("Breakeven available");
 * }
 * ```
 */
export async function getBreakeven(
  symbol: string,
  currentPrice: number,
): Promise<boolean> {
  backtest.loggerService.info(GET_BREAKEVEN_METHOD_NAME, {
    symbol,
    currentPrice,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getBreakeven requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getBreakeven requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getBreakeven(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the effective (DCA-weighted) entry price for the current pending signal.
 *
 * Uses cost-weighted harmonic mean: Σcost / Σ(cost/price).
 * When partial closes exist, the price is computed iteratively using
 * costBasisAtClose snapshots from each partial, then blended with any
 * DCA entries added after the last partial.
 * With no DCA entries, equals the original priceOpen.
 *
 * Returns null if no pending signal exists.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to effective entry price or null
 *
 * @example
 * ```typescript
 * import { getPositionEffectivePrice } from "backtest-kit";
 *
 * const avgPrice = await getPositionEffectivePrice("BTCUSDT");
 * // No DCA: avgPrice === priceOpen
 * // After DCA at lower price: avgPrice < priceOpen
 * ```
 */
export async function getPositionEffectivePrice(
  symbol: string,
): Promise<number | null> {
  backtest.loggerService.info(GET_POSITION_AVERAGE_PRICE_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionEffectivePrice requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionEffectivePrice requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionEffectivePrice(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the number of DCA entries made for the current pending signal.
 *
 * 1 = original entry only (no DCA).
 * Increases by 1 with each successful commitAverageBuy().
 *
 * Returns null if no pending signal exists.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to entry count or null
 *
 * @example
 * ```typescript
 * import { getPositionInvestedCount } from "backtest-kit";
 *
 * const count = await getPositionInvestedCount("BTCUSDT");
 * // No DCA: count === 1
 * // After one DCA: count === 2
 * ```
 */
export async function getPositionInvestedCount(
  symbol: string,
): Promise<number | null> {
  backtest.loggerService.info(GET_POSITION_INVESTED_COUNT_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionInvestedCount requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionInvestedCount requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionInvestedCount(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the total invested cost basis in dollars for the current pending signal.
 *
 * Equal to the sum of all _entry costs (Σ entry.cost).
 * Each entry cost is set at the time of commitAverageBuy (defaults to CC_POSITION_ENTRY_COST).
 *
 * Returns null if no pending signal exists.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to total invested cost in dollars or null
 *
 * @example
 * ```typescript
 * import { getPositionInvestedCost } from "backtest-kit";
 *
 * const cost = await getPositionInvestedCost("BTCUSDT");
 * // No DCA, default cost: cost === 100
 * // After one DCA with default cost: cost === 200
 * ```
 */
export async function getPositionInvestedCost(
  symbol: string,
): Promise<number | null> {
  backtest.loggerService.info(GET_POSITION_INVESTED_COST_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionInvestedCost requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionInvestedCost requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionInvestedCost(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the unrealized PNL percentage for the current pending signal at current market price.
 *
 * Accounts for partial closes, DCA entries, slippage and fees
 * (delegates to toProfitLossDto).
 *
 * Returns null if no pending signal exists.
 *
 * Automatically detects backtest/live mode from execution context.
 * Automatically fetches current price via getAveragePrice.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to PNL percentage or null
 *
 * @example
 * ```typescript
 * import { getPositionPnlPercent } from "backtest-kit";
 *
 * const pnlPct = await getPositionPnlPercent("BTCUSDT");
 * // LONG at 100, current=105: pnlPct ≈ 5
 * // LONG at 100, current=95: pnlPct ≈ -5
 * ```
 */
export async function getPositionPnlPercent(
  symbol: string,
): Promise<number | null> {
  backtest.loggerService.info(GET_POSITION_PNL_PERCENT_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionPnlPercent requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionPnlPercent requires a method context");
  }
  const currentPrice = await getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionPnlPercent(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Executes partial close at profit level by absolute dollar amount (moving toward TP).
 *
 * Convenience wrapper around commitPartialProfit that converts a dollar amount
 * to a percentage of the invested position cost automatically.
 * Price must be moving toward take profit (in profit direction).
 *
 * Automatically detects backtest/live mode from execution context.
 * Automatically fetches current price via getAveragePrice.
 *
 * @param symbol - Trading pair symbol
 * @param dollarAmount - Dollar value of position to close (e.g. 150 closes $150 worth)
 * @returns Promise<boolean> - true if partial close executed, false if skipped or no position
 *
 * @throws Error if currentPrice is not in profit direction:
 *   - LONG: currentPrice must be > priceOpen
 *   - SHORT: currentPrice must be < priceOpen
 *
 * @example
 * ```typescript
 * import { commitPartialProfitCost } from "backtest-kit";
 *
 * // Close $150 of a $300 position (50%) at profit
 * const success = await commitPartialProfitCost("BTCUSDT", 150);
 * if (success) {
 *   console.log('Partial profit executed');
 * }
 * ```
 */
export async function commitPartialProfitCost(
  symbol: string,
  dollarAmount: number,
): Promise<boolean> {
  backtest.loggerService.info(PARTIAL_PROFIT_COST_METHOD_NAME, {
    symbol,
    dollarAmount,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("commitPartialProfitCost requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("commitPartialProfitCost requires a method context");
  }
  const currentPrice = await getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const investedCost =
    await backtest.strategyCoreService.getPositionInvestedCost(
      isBacktest,
      symbol,
      { exchangeName, frameName, strategyName },
    );
  if (investedCost === null) {
    return false;
  }
  const signalForProfitCost = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signalForProfitCost) {
    return false;
  }
  const percentToClose = investedCostToPercent(dollarAmount, investedCost);
  if (
    await not(
      backtest.strategyCoreService.validatePartialProfit(
        isBacktest,
        symbol,
        percentToClose,
        currentPrice,
        { exchangeName, frameName, strategyName },
      ),
    )
  ) {
    return false;
  }
  await Broker.commitPartialProfit({
    symbol,
    percentToClose,
    cost: dollarAmount,
    currentPrice,
    position: signalForProfitCost.position,
    priceTakeProfit: signalForProfitCost.priceTakeProfit,
    priceStopLoss: signalForProfitCost.priceStopLoss,
    context: { exchangeName, frameName, strategyName },
    backtest: isBacktest,
  });
  return await backtest.strategyCoreService.partialProfit(
    isBacktest,
    symbol,
    percentToClose,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Executes partial close at loss level by absolute dollar amount (moving toward SL).
 *
 * Convenience wrapper around commitPartialLoss that converts a dollar amount
 * to a percentage of the invested position cost automatically.
 * Price must be moving toward stop loss (in loss direction).
 *
 * Automatically detects backtest/live mode from execution context.
 * Automatically fetches current price via getAveragePrice.
 *
 * @param symbol - Trading pair symbol
 * @param dollarAmount - Dollar value of position to close (e.g. 100 closes $100 worth)
 * @returns Promise<boolean> - true if partial close executed, false if skipped or no position
 *
 * @throws Error if currentPrice is not in loss direction:
 *   - LONG: currentPrice must be < priceOpen
 *   - SHORT: currentPrice must be > priceOpen
 *
 * @example
 * ```typescript
 * import { commitPartialLossCost } from "backtest-kit";
 *
 * // Close $100 of a $300 position (~33%) at loss
 * const success = await commitPartialLossCost("BTCUSDT", 100);
 * if (success) {
 *   console.log('Partial loss executed');
 * }
 * ```
 */
export async function commitPartialLossCost(
  symbol: string,
  dollarAmount: number,
): Promise<boolean> {
  backtest.loggerService.info(PARTIAL_LOSS_COST_METHOD_NAME, {
    symbol,
    dollarAmount,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("commitPartialLossCost requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("commitPartialLossCost requires a method context");
  }
  const currentPrice = await getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const investedCost =
    await backtest.strategyCoreService.getPositionInvestedCost(
      isBacktest,
      symbol,
      { exchangeName, frameName, strategyName },
    );
  if (investedCost === null) {
    return false;
  }
  const signalForLossCost = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signalForLossCost) {
    return false;
  }
  const percentToClose = investedCostToPercent(dollarAmount, investedCost);
  if (
    await not(
      backtest.strategyCoreService.validatePartialLoss(
        isBacktest,
        symbol,
        percentToClose,
        currentPrice,
        { exchangeName, frameName, strategyName },
      ),
    )
  ) {
    return false;
  }
  await Broker.commitPartialLoss({
    symbol,
    percentToClose,
    cost: dollarAmount,
    currentPrice,
    position: signalForLossCost.position,
    priceTakeProfit: signalForLossCost.priceTakeProfit,
    priceStopLoss: signalForLossCost.priceStopLoss,
    context: { exchangeName, frameName, strategyName },
    backtest: isBacktest,
  });
  return await backtest.strategyCoreService.partialLoss(
    isBacktest,
    symbol,
    percentToClose,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the unrealized PNL in dollars for the current pending signal at current market price.
 *
 * Calculated as: pnlPercentage / 100 × totalInvestedCost.
 * Accounts for partial closes, DCA entries, slippage and fees.
 *
 * Returns null if no pending signal exists.
 *
 * Automatically detects backtest/live mode from execution context.
 * Automatically fetches current price via getAveragePrice.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to PNL in dollars or null
 *
 * @example
 * ```typescript
 * import { getPositionPnlCost } from "backtest-kit";
 *
 * const pnlCost = await getPositionPnlCost("BTCUSDT");
 * // LONG at 100, invested $100, current=105: pnlCost ≈ 5
 * // LONG at 100, invested $200 (DCA), current=95: pnlCost ≈ -10
 * ```
 */
export async function getPositionPnlCost(
  symbol: string,
): Promise<number | null> {
  backtest.loggerService.info(GET_POSITION_PNL_COST_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionPnlCost requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionPnlCost requires a method context");
  }
  const currentPrice = await getAveragePrice(symbol);
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionPnlCost(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the list of DCA entry prices for the current pending signal.
 *
 * The first element is always the original priceOpen (initial entry).
 * Each subsequent element is a price added by commitAverageBuy().
 *
 * Returns null if no pending signal exists.
 * Returns a single-element array [priceOpen] if no DCA entries were made.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to array of entry prices or null
 *
 * @example
 * ```typescript
 * import { getPositionLevels } from "backtest-kit";
 *
 * const levels = await getPositionLevels("BTCUSDT");
 * // No DCA: [43000]
 * // One DCA: [43000, 42000]
 * ```
 */
export async function getPositionLevels(
  symbol: string,
): Promise<number[] | null> {
  backtest.loggerService.info(GET_POSITION_LEVELS_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionLevels requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionLevels requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionLevels(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the list of partial close events for the current pending signal.
 *
 * Each element represents a partial profit or loss close executed via
 * commitPartialProfit / commitPartialLoss (or their Cost variants).
 *
 * Returns null if no pending signal exists.
 * Returns an empty array if no partials were executed yet.
 *
 * Each entry contains:
 * - `type` — "profit" or "loss"
 * - `percent` — percentage of position closed at this partial
 * - `currentPrice` — execution price of the partial close
 * - `costBasisAtClose` — accounting cost basis at the moment of this partial
 * - `entryCountAtClose` — number of DCA entries accumulated at this partial
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to array of partial close records or null
 *
 * @example
 * ```typescript
 * import { getPositionPartials } from "backtest-kit";
 *
 * const partials = await getPositionPartials("BTCUSDT");
 * // No partials yet: []
 * // After one partial profit: [{ type: "profit", percent: 50, currentPrice: 45000, ... }]
 * ```
 */
export async function getPositionPartials(symbol: string) {
  backtest.loggerService.info(GET_POSITION_PARTIALS_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionPartials requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionPartials requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionPartials(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the list of DCA entry prices and costs for the current pending signal.
 *
 * Each element represents a single position entry — the initial open or a subsequent
 * DCA entry added via commitAverageBuy.
 *
 * Returns null if no pending signal exists.
 * Returns a single-element array if no DCA entries were made.
 *
 * Each entry contains:
 * - `price` — execution price of this entry
 * - `cost` — dollar cost allocated to this entry (e.g. 100 for $100)
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to array of entry records or null
 *
 * @example
 * ```typescript
 * import { getPositionEntries } from "backtest-kit";
 *
 * const entries = await getPositionEntries("BTCUSDT");
 * // No DCA: [{ price: 43000, cost: 100 }]
 * // One DCA: [{ price: 43000, cost: 100 }, { price: 42000, cost: 100 }]
 * ```
 */
export async function getPositionEntries(symbol: string) {
  backtest.loggerService.info(GET_POSITION_ENTRIES_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionEntries requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionEntries requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionEntries(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the original estimated duration for the current pending signal.
 *
 * Reflects `minuteEstimatedTime` as set in the signal DTO — the maximum
 * number of minutes the position is expected to be active before `time_expired`.
 *
 * Returns null if no pending signal exists.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to estimated duration in minutes or null
 *
 * @example
 * ```typescript
 * import { getPositionEstimateMinutes } from "backtest-kit";
 *
 * const estimate = await getPositionEstimateMinutes("BTCUSDT");
 * // e.g. 120 (2 hours)
 * ```
 */
export async function getPositionEstimateMinutes(symbol: string) {
  backtest.loggerService.info(GET_POSITION_ESTIMATE_MINUTES_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionEstimateMinutes requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionEstimateMinutes requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionEstimateMinutes(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the remaining time before the position expires, clamped to zero.
 *
 * Computes elapsed minutes since `pendingAt` and subtracts from `minuteEstimatedTime`.
 * Returns 0 once the estimate is exceeded (never negative).
 *
 * Returns null if no pending signal exists.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to remaining minutes (≥ 0) or null
 *
 * @example
 * ```typescript
 * import { getPositionCountdownMinutes } from "backtest-kit";
 *
 * const remaining = await getPositionCountdownMinutes("BTCUSDT");
 * // e.g. 45 (45 minutes left)
 * // 0 when expired
 * ```
 */
export async function getPositionCountdownMinutes(symbol: string) {
  backtest.loggerService.info(GET_POSITION_COUNTDOWN_MINUTES_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionCountdownMinutes requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionCountdownMinutes requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionCountdownMinutes(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the best price reached in the profit direction during this position's life.
 *
 * Initialized at position open with the entry price and timestamp.
 * Updated on every tick/candle when VWAP moves beyond the previous record toward TP:
 * - LONG: tracks the highest price seen above effective entry
 * - SHORT: tracks the lowest price seen below effective entry
 *
 * Returns null if no pending signal exists.
 * Never returns null when a signal is active — always contains at least the entry price.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to `{ price, timestamp }` record or null
 *
 * @example
 * ```typescript
 * import { getPositionHighestProfitPrice } from "backtest-kit";
 *
 * const peak = await getPositionHighestProfitPrice("BTCUSDT");
 * // e.g. { price: 44500, timestamp: 1700000000000 }
 * ```
 */
export async function getPositionHighestProfitPrice(symbol: string) {
  backtest.loggerService.info(GET_POSITION_HIGHEST_PROFIT_PRICE_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionHighestProfitPrice requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionHighestProfitPrice requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionHighestProfitPrice(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the timestamp when the best profit price was recorded during this position's life.
 *
 * Returns null if no pending signal exists.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to timestamp in milliseconds or null
 *
 * @example
 * ```typescript
 * import { getPositionHighestProfitTimestamp } from "backtest-kit";
 *
 * const ts = await getPositionHighestProfitTimestamp("BTCUSDT");
 * // e.g. 1700000000000
 * ```
 */
export async function getPositionHighestProfitTimestamp(symbol: string) {
  backtest.loggerService.info(GET_POSITION_HIGHEST_PROFIT_TIMESTAMP_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionHighestProfitTimestamp requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionHighestProfitTimestamp requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionHighestProfitTimestamp(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the PnL percentage at the moment the best profit price was recorded during this position's life.
 *
 * Returns null if no pending signal exists.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to PnL percentage or null
 *
 * @example
 * ```typescript
 * import { getPositionHighestPnlPercentage } from "backtest-kit";
 *
 * const pnl = await getPositionHighestPnlPercentage("BTCUSDT");
 * // e.g. 3.5
 * ```
 */
export async function getPositionHighestPnlPercentage(symbol: string) {
  backtest.loggerService.info(GET_POSITION_HIGHEST_PNL_PERCENTAGE_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionHighestPnlPercentage requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionHighestPnlPercentage requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionHighestPnlPercentage(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the PnL cost (in quote currency) at the moment the best profit price was recorded during this position's life.
 *
 * Returns null if no pending signal exists.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to PnL cost or null
 *
 * @example
 * ```typescript
 * import { getPositionHighestPnlCost } from "backtest-kit";
 *
 * const pnlCost = await getPositionHighestPnlCost("BTCUSDT");
 * // e.g. 35.5
 * ```
 */
export async function getPositionHighestPnlCost(symbol: string) {
  backtest.loggerService.info(GET_POSITION_HIGHEST_PNL_COST_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionHighestPnlCost requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionHighestPnlCost requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionHighestPnlCost(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns whether breakeven was mathematically reachable at the highest profit price.
 *
 * Returns null if no pending signal exists.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to true if breakeven was reachable at peak, false otherwise, or null
 *
 * @example
 * ```typescript
 * import { getPositionHighestProfitBreakeven } from "backtest-kit";
 *
 * const couldBreakeven = await getPositionHighestProfitBreakeven("BTCUSDT");
 * // e.g. true (price reached the breakeven threshold at its peak)
 * ```
 */
export async function getPositionHighestProfitBreakeven(symbol: string) {
  backtest.loggerService.info(GET_POSITION_HIGHEST_PROFIT_BREAKEVEN_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionHighestProfitBreakeven requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionHighestProfitBreakeven requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionHighestProfitBreakeven(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Returns the number of minutes elapsed since the highest profit price was recorded.
 *
 * Measures how long the position has been pulling back from its peak profit level.
 * Zero when called at the exact moment the peak was set.
 * Grows continuously as price moves away from the peak without setting a new record.
 *
 * Returns null if no pending signal exists.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to drawdown duration in minutes or null
 *
 * @example
 * ```typescript
 * import { getPositionDrawdownMinutes } from "backtest-kit";
 *
 * const drawdown = await getPositionDrawdownMinutes("BTCUSDT");
 * // e.g. 30 (30 minutes since the highest profit price)
 * ```
 */
export async function getPositionDrawdownMinutes(symbol: string) {
  backtest.loggerService.info(GET_POSITION_DRAWDOWN_MINUTES_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionDrawdownMinutes requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionDrawdownMinutes requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return await backtest.strategyCoreService.getPositionDrawdownMinutes(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
}

/**
 * Checks whether the current price falls within the tolerance zone of any existing DCA entry level.
 * Use this to prevent duplicate DCA entries at the same price area.
 *
 * Returns true if currentPrice is within [level - lowerStep, level + upperStep] for any level,
 * where step = level * percent / 100.
 * Returns false if no pending signal exists.
 *
 * @param symbol - Trading pair symbol
 * @param currentPrice - Price to check against existing DCA levels
 * @param ladder - Tolerance zone config; percentages in 0–100 format (default: 1.5% up and down)
 * @returns Promise<boolean> - true if price overlaps an existing entry level (DCA not recommended)
 *
 * @example
 * ```typescript
 * import { getPositionEntryOverlap } from "backtest-kit";
 *
 * // LONG with levels [43000, 42000], check if 42100 is too close to 42000
 * const overlap = await getPositionEntryOverlap("BTCUSDT", 42100, { upperPercent: 5, lowerPercent: 5 });
 * // overlap = true (42100 is within 5% of 42000 = [39900, 44100])
 * if (!overlap) {
 *   await commitAverageBuy("BTCUSDT");
 * }
 * ```
 */
export async function getPositionEntryOverlap(
  symbol: string,
  currentPrice: number,
  ladder: IPositionOverlapLadder = POSITION_OVERLAP_LADDER_DEFAULT,
): Promise<boolean> {
  backtest.loggerService.info(GET_POSITION_ENTRY_OVERLAP_METHOD_NAME, {
    symbol,
    currentPrice,
    ladder,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionEntryOverlap requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionEntryOverlap requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const levels = await backtest.strategyCoreService.getPositionLevels(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
  if (!levels) {
    return false;
  }
  return levels.some((level) => {
    const upperStep = (level * ladder.upperPercent) / 100;
    const lowerStep = (level * ladder.lowerPercent) / 100;
    return currentPrice >= level - lowerStep && currentPrice <= level + upperStep;
  });
}

/**
 * Checks whether the current price falls within the tolerance zone of any existing partial close price.
 * Use this to prevent duplicate partial closes at the same price area.
 *
 * Returns true if currentPrice is within [partial.currentPrice - lowerStep, partial.currentPrice + upperStep]
 * for any partial, where step = partial.currentPrice * percent / 100.
 * Returns false if no pending signal exists or no partials have been executed yet.
 *
 * @param symbol - Trading pair symbol
 * @param currentPrice - Price to check against existing partial close prices
 * @param ladder - Tolerance zone config; percentages in 0–100 format (default: 1.5% up and down)
 * @returns Promise<boolean> - true if price overlaps an existing partial price (partial not recommended)
 *
 * @example
 * ```typescript
 * import { getPositionPartialOverlap } from "backtest-kit";
 *
 * // Partials at [45000], check if 45100 is too close
 * const overlap = await getPositionPartialOverlap("BTCUSDT", 45100, { upperPercent: 1.5, lowerPercent: 1.5 });
 * // overlap = true (45100 is within 1.5% of 45000)
 * if (!overlap) {
 *   await commitPartialProfit("BTCUSDT", 50);
 * }
 * ```
 */
export async function getPositionPartialOverlap(
  symbol: string,
  currentPrice: number,
  ladder: IPositionOverlapLadder = POSITION_OVERLAP_LADDER_DEFAULT,
): Promise<boolean> {
  backtest.loggerService.info(GET_POSITION_PARTIAL_OVERLAP_METHOD_NAME, {
    symbol,
    currentPrice,
    ladder,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getPositionPartialOverlap requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getPositionPartialOverlap requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const partials = await backtest.strategyCoreService.getPositionPartials(
    isBacktest,
    symbol,
    { exchangeName, frameName, strategyName },
  );
  if (!partials) {
    return false;
  }
  return partials.some((partial) => {
    const upperStep = (partial.currentPrice * ladder.upperPercent) / 100;
    const lowerStep = (partial.currentPrice * ladder.lowerPercent) / 100;
    return currentPrice >= partial.currentPrice - lowerStep && currentPrice <= partial.currentPrice + upperStep;
  });
}

/**
 * Returns true if there is NO active pending signal for the given symbol.
 *
 * Inverse of hasPendingSignal. Use to guard signal generation logic.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise<boolean> - true if no pending signal exists, false if one does
 *
 * @example
 * ```typescript
 * import { hasNoPendingSignal } from "backtest-kit";
 *
 * if (await hasNoPendingSignal("BTCUSDT")) {
 *   // safe to open a new position
 * }
 * ```
 */
export async function hasNoPendingSignal(symbol: string): Promise<boolean> {
  backtest.loggerService.info(HAS_NO_PENDING_SIGNAL_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("hasNoPendingSignal requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("hasNoPendingSignal requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return await not(
    backtest.strategyCoreService.hasPendingSignal(
      isBacktest,
      symbol,
      { exchangeName, frameName, strategyName },
    )
  );
}

/**
 * Returns true if there is NO active scheduled signal for the given symbol.
 *
 * Inverse of hasScheduledSignal. Use to guard signal generation logic.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise<boolean> - true if no scheduled signal exists, false if one does
 *
 * @example
 * ```typescript
 * import { hasNoScheduledSignal } from "backtest-kit";
 *
 * if (await hasNoScheduledSignal("BTCUSDT")) {
 *   // safe to schedule a new signal
 * }
 * ```
 */
export async function hasNoScheduledSignal(symbol: string): Promise<boolean> {
  backtest.loggerService.info(HAS_NO_SCHEDULED_SIGNAL_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("hasNoScheduledSignal requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("hasNoScheduledSignal requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return await not(
    backtest.strategyCoreService.hasScheduledSignal(
      isBacktest,
      symbol,
      { exchangeName, frameName, strategyName },
    )
  );
}
