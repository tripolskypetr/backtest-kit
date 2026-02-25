import { ISignalRow, IStrategyPnL } from "../interfaces/Strategy.interface";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Calculates profit/loss for a closed signal with slippage and fees.
 *
 * For signals with partial closes:
 * - Calculates weighted PNL: Σ(percent_i × pnl_i) for each partial + (remaining% × final_pnl)
 * - Each partial close has its own slippage
 * - Open fee is charged once; close fees are proportional to each partial's size
 * - Total fees = CC_PERCENT_FEE (open) + Σ CC_PERCENT_FEE × (partial% / 100) × (closeWithSlip / openWithSlip)
 *
 * Formula breakdown:
 * 1. Apply slippage to open/close prices (worse execution)
 *    - LONG: buy higher (+slippage), sell lower (-slippage)
 *    - SHORT: sell lower (-slippage), buy higher (+slippage)
 * 2. Calculate raw PNL percentage
 *    - LONG: ((closePrice - openPrice) / openPrice) * 100
 *    - SHORT: ((openPrice - closePrice) / openPrice) * 100
 * 3. Subtract total fees: open fee + close fee adjusted for slippage-affected execution price
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

    // Open fee is paid once for the whole position
    let totalFees = GLOBAL_CONFIG.CC_PERCENT_FEE;

    // priceOpenWithSlippage is the same for all partials — compute once
    const priceOpenWithSlippage =
      signal.position === "long"
        ? priceOpen * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100)
        : priceOpen * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);

    // Calculate PNL for each partial close
    for (const partial of signal._partial) {
      const partialPercent = partial.percent;

      const priceCloseWithSlippage =
        signal.position === "long"
          ? partial.price * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100)
          : partial.price * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);

      // Calculate PNL for this partial
      const partialPnl =
        signal.position === "long"
          ? ((priceCloseWithSlippage - priceOpenWithSlippage) / priceOpenWithSlippage) * 100
          : ((priceOpenWithSlippage - priceCloseWithSlippage) / priceOpenWithSlippage) * 100;

      // Weight by percentage of position closed
      totalWeightedPnl += (partialPercent / 100) * partialPnl;

      // Close fee is proportional to the size of this partial and adjusted for slippage
      totalFees += GLOBAL_CONFIG.CC_PERCENT_FEE * (partialPercent / 100) * (priceCloseWithSlippage / priceOpenWithSlippage);
    }

    // Calculate PNL for remaining position (if any)
    // Compute totalClosed from _partial array
    const totalClosed = signal._partial.reduce((sum, p) => sum + p.percent, 0);
    if (totalClosed > 100) {
      throw new Error(`Partial closes exceed 100%: ${totalClosed}% (signal id: ${signal.id})`);
    }
    const remainingPercent = 100 - totalClosed;
    if (remainingPercent > 0) {
      const priceCloseWithSlippage =
        signal.position === "long"
          ? priceClose * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100)
          : priceClose * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);

      // Calculate PNL for remaining
      const remainingPnl =
        signal.position === "long"
          ? ((priceCloseWithSlippage - priceOpenWithSlippage) / priceOpenWithSlippage) * 100
          : ((priceOpenWithSlippage - priceCloseWithSlippage) / priceOpenWithSlippage) * 100;

      // Weight by remaining percentage
      totalWeightedPnl += (remainingPercent / 100) * remainingPnl;

      // Close fee is proportional to the remaining size and adjusted for slippage
      totalFees += GLOBAL_CONFIG.CC_PERCENT_FEE * (remainingPercent / 100) * (priceCloseWithSlippage / priceOpenWithSlippage);
    }

    // Subtract total fees from weighted PNL
    // totalFees = CC_PERCENT_FEE (open) + Σ CC_PERCENT_FEE × (partialPercent/100) × (closeWithSlip/openWithSlip)
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
    // LONG: покупаем дороже, продаем дешевле
    priceOpenWithSlippage = priceOpen * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
    priceCloseWithSlippage = priceClose * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
  } else {
    // SHORT: продаем дешевле, покупаем дороже
    priceOpenWithSlippage = priceOpen * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
    priceCloseWithSlippage = priceClose * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
  }

  // Открытие: комиссия от цены входа; закрытие: комиссия от фактической цены выхода (с учётом slippage)
  const totalFee = GLOBAL_CONFIG.CC_PERCENT_FEE * (1 + priceCloseWithSlippage / priceOpenWithSlippage);

  let pnlPercentage: number;

  if (signal.position === "long") {
    // LONG: прибыль при росте цены
    pnlPercentage =
      ((priceCloseWithSlippage - priceOpenWithSlippage) /
        priceOpenWithSlippage) *
      100;
  } else {
    // SHORT: прибыль при падении цены
    pnlPercentage =
      ((priceOpenWithSlippage - priceCloseWithSlippage) /
        priceOpenWithSlippage) *
      100;
  }

  // Вычитаем комиссии
  pnlPercentage -= totalFee;

  return {
    pnlPercentage,
    priceOpen,
    priceClose,
  };
};

export default toProfitLossDto;
