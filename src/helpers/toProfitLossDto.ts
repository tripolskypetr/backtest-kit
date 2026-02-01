import { ISignalRow, IStrategyPnL } from "../interfaces/Strategy.interface";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Calculates profit/loss for a closed signal with slippage and fees.
 *
 * For signals with partial closes:
 * - Calculates weighted PNL: Σ(percent_i × pnl_i) for each partial + (remaining% × final_pnl)
 * - Each partial close has its own fees and slippage
 * - Total fees = 2 × (number of partial closes + 1 final close) × CC_PERCENT_FEE
 *
 * Formula breakdown:
 * 1. Apply slippage to open/close prices (worse execution)
 *    - LONG: buy higher (+slippage), sell lower (-slippage)
 *    - SHORT: sell lower (-slippage), buy higher (+slippage)
 * 2. Calculate raw PNL percentage
 *    - LONG: ((closePrice - openPrice) / openPrice) * 100
 *    - SHORT: ((openPrice - closePrice) / openPrice) * 100
 * 3. Subtract total fees (0.1% * 2 = 0.2% per transaction)
 *
 * @param signal - Closed signal with position details and optional partial history
 * @param priceClose - Actual close price at final exit
 * @returns PNL data with percentage and prices
 *
 * @example
 * ```typescript
 * // Signal without partial closes
 * const pnl = toProfitLossDto(
 *   {
 *     position: "long",
 *     priceOpen: 100,
 *   },
 *   110 // close at +10%
 * );
 * console.log(pnl.pnlPercentage); // ~9.6% (after slippage and fees)
 *
 * // Signal with partial closes
 * const pnlPartial = toProfitLossDto(
 *   {
 *     position: "long",
 *     priceOpen: 100,
 *     _partial: [
 *       { type: "profit", percent: 30, price: 120 }, // +20% on 30%
 *       { type: "profit", percent: 40, price: 115 }, // +15% on 40%
 *     ],
 *   },
 *   105 // final close at +5% for remaining 30%
 * );
 * // Weighted PNL = 30% × 20% + 40% × 15% + 30% × 5% = 6% + 6% + 1.5% = 13.5% (before fees)
 * ```
 */
export const toProfitLossDto = (
  signal: ISignalRow,
  priceClose: number
): IStrategyPnL => {
  const priceOpen = signal.priceOpen;

  // Calculate weighted PNL with partial closes
  if (signal._partial && signal._partial.length > 0) {
    let totalWeightedPnl = 0;
    let totalFees = 0;

    // Calculate PNL for each partial close
    for (const partial of signal._partial) {
      const partialPercent = partial.percent;
      const partialPrice = partial.price;

      // Apply slippage to prices
      let priceOpenWithSlippage: number;
      let priceCloseWithSlippage: number;

      if (signal.position === "long") {
        priceOpenWithSlippage = priceOpen * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
        priceCloseWithSlippage = partialPrice * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
      } else {
        priceOpenWithSlippage = priceOpen * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
        priceCloseWithSlippage = partialPrice * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
      }

      // Calculate PNL for this partial
      let partialPnl: number;
      if (signal.position === "long") {
        partialPnl = ((priceCloseWithSlippage - priceOpenWithSlippage) / priceOpenWithSlippage) * 100;
      } else {
        partialPnl = ((priceOpenWithSlippage - priceCloseWithSlippage) / priceOpenWithSlippage) * 100;
      }

      // Weight by percentage of position closed
      const weightedPnl = (partialPercent / 100) * partialPnl;
      totalWeightedPnl += weightedPnl;

      // Each partial has fees for open + close (2 transactions)
      totalFees += GLOBAL_CONFIG.CC_PERCENT_FEE * 2;
    }

    // Calculate PNL for remaining position (if any)
    // Compute totalClosed from _partial array
    const totalClosed = signal._partial.reduce((sum, p) => sum + p.percent, 0);
    const remainingPercent = 100 - totalClosed;
    if (remainingPercent > 0) {
      // Apply slippage
      let priceOpenWithSlippage: number;
      let priceCloseWithSlippage: number;

      if (signal.position === "long") {
        priceOpenWithSlippage = priceOpen * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
        priceCloseWithSlippage = priceClose * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
      } else {
        priceOpenWithSlippage = priceOpen * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
        priceCloseWithSlippage = priceClose * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
      }

      // Calculate PNL for remaining
      let remainingPnl: number;
      if (signal.position === "long") {
        remainingPnl = ((priceCloseWithSlippage - priceOpenWithSlippage) / priceOpenWithSlippage) * 100;
      } else {
        remainingPnl = ((priceOpenWithSlippage - priceCloseWithSlippage) / priceOpenWithSlippage) * 100;
      }

      // Weight by remaining percentage
      const weightedRemainingPnl = (remainingPercent / 100) * remainingPnl;
      totalWeightedPnl += weightedRemainingPnl;

      // Final close also has fees
      totalFees += GLOBAL_CONFIG.CC_PERCENT_FEE * 2;
    }

    // Subtract total fees from weighted PNL
    const pnlPercentage = totalWeightedPnl - totalFees;

    return {
      pnlPercentage,
      priceOpen,
      priceClose,
    };
  }

  // Original logic for signals without partial closes
  let priceOpenWithSlippage: number;
  let priceCloseWithSlippage: number;

  if (signal.position === "long") {
    // LONG: buy higher, sell lower
    priceOpenWithSlippage = priceOpen * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
    priceCloseWithSlippage = priceClose * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
  } else {
    // SHORT: sell lower, buy higher
    priceOpenWithSlippage = priceOpen * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
    priceCloseWithSlippage = priceClose * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
  }

  // Apply fee twice (on open and close)
  const totalFee = GLOBAL_CONFIG.CC_PERCENT_FEE * 2;

  let pnlPercentage: number;

  if (signal.position === "long") {
    // LONG: profit when price rises
    pnlPercentage =
      ((priceCloseWithSlippage - priceOpenWithSlippage) /
        priceOpenWithSlippage) *
      100;
  } else {
    // SHORT: profit when price falls
    pnlPercentage =
      ((priceOpenWithSlippage - priceCloseWithSlippage) /
        priceOpenWithSlippage) *
      100;
  }

  // Subtract fees
  pnlPercentage -= totalFee;

  return {
    pnlPercentage,
    priceOpen,
    priceClose,
  };
};

export default toProfitLossDto;
