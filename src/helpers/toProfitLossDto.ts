import { ISignalRow, IStrategyPnL } from "../interfaces/Strategy.interface";
import { GLOBAL_CONFIG } from "../config/params";
import { getEffectivePriceOpen, computeEffectivePriceAtPartial } from "./getEffectivePriceOpen";

/**
 * Calculates profit/loss for a closed signal with slippage and fees.
 *
 * For signals with partial closes:
 * - Weights are calculated by ACTUAL DOLLAR VALUE of each partial relative to total invested.
 *   This correctly handles DCA entries that occur before or after partial closes.
 *
 * Partial effective price is computed from costBasisAtClose snapshot:
 *   effectivePrice = costBasisAtClose / Σ(entry.cost/entry.price for entries[0..entryCountAtClose])
 *
 * Fee structure:
 *   - Open fee:  CC_PERCENT_FEE (charged once)
 *   - Close fee: CC_PERCENT_FEE × weight × (closeWithSlip / openWithSlip) per partial/remaining
 *
 * @param signal - Closed signal with position details and optional partial history
 * @param priceClose - Actual close price at final exit
 * @returns PNL data with percentage, prices, and USD amounts
 */
export const toProfitLossDto = (
  signal: ISignalRow,
  priceClose: number
): IStrategyPnL => {
  const entries = signal._entry ?? [];
  const totalInvested = entries.length > 0
    ? entries.reduce((s, e) => s + e.cost, 0)
    : GLOBAL_CONFIG.CC_POSITION_ENTRY_COST;

  const priceOpen = getEffectivePriceOpen(signal);

  // Calculate weighted PNL with partial closes
  if (signal._partial && signal._partial.length > 0) {
    let totalWeightedPnl = 0;

    // Open fee is paid once for the whole position
    let totalFees = GLOBAL_CONFIG.CC_PERCENT_FEE;

    let closedDollarValue = 0;

    // Calculate PNL for each partial close
    for (let i = 0; i < signal._partial.length; i++) {
      const partial = signal._partial[i];

      // Real dollar value sold in this partial
      const partialDollarValue = (partial.percent / 100) * partial.costBasisAtClose;

      // Weight relative to total invested capital
      const weight = partialDollarValue / totalInvested;

      closedDollarValue += partialDollarValue;

      // Effective entry price at this partial — computed using the snapshot approach:
      // same as getEffectivePriceOpen but limited to partials[0..i-1] and entries[0..entryCountAtClose]
      const effectivePrice = computeEffectivePriceAtPartial(
        entries, signal._partial!, i, signal.priceOpen
      );

      const priceOpenWithSlippage =
        signal.position === "long"
          ? effectivePrice * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100)
          : effectivePrice * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);

      const priceCloseWithSlippage =
        signal.position === "long"
          ? partial.currentPrice * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100)
          : partial.currentPrice * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);

      const partialPnl =
        signal.position === "long"
          ? ((priceCloseWithSlippage - priceOpenWithSlippage) / priceOpenWithSlippage) * 100
          : ((priceOpenWithSlippage - priceCloseWithSlippage) / priceOpenWithSlippage) * 100;

      totalWeightedPnl += weight * partialPnl;

      // Close fee proportional to real dollar weight
      totalFees +=
        GLOBAL_CONFIG.CC_PERCENT_FEE *
        weight *
        (priceCloseWithSlippage / priceOpenWithSlippage);
    }

    if (closedDollarValue > totalInvested + 0.001) {
      throw new Error(
        `Partial closes dollar value (${closedDollarValue.toFixed(4)}) exceeds total invested (${totalInvested}) — signal id: ${signal.id}`
      );
    }

    // Remaining position
    const remainingDollarValue = totalInvested - closedDollarValue;
    const remainingWeight = remainingDollarValue / totalInvested;

    if (remainingWeight > 0) {
      const remainingOpenWithSlippage =
        signal.position === "long"
          ? priceOpen * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100)
          : priceOpen * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);

      const priceCloseWithSlippage =
        signal.position === "long"
          ? priceClose * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100)
          : priceClose * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);

      const remainingPnl =
        signal.position === "long"
          ? ((priceCloseWithSlippage - remainingOpenWithSlippage) / remainingOpenWithSlippage) * 100
          : ((remainingOpenWithSlippage - priceCloseWithSlippage) / remainingOpenWithSlippage) * 100;

      totalWeightedPnl += remainingWeight * remainingPnl;

      totalFees +=
        GLOBAL_CONFIG.CC_PERCENT_FEE *
        remainingWeight *
        (priceCloseWithSlippage / remainingOpenWithSlippage);
    }

    const pnlPercentage = totalWeightedPnl - totalFees;

    return {
      pnlPercentage,
      priceOpen,
      priceClose,
      pnlCost: (pnlPercentage / 100) * totalInvested,
      pnlEntries: totalInvested,
    };
  }

  // No partial closes
  let priceOpenWithSlippage: number;
  let priceCloseWithSlippage: number;

  if (signal.position === "long") {
    priceOpenWithSlippage = priceOpen * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
    priceCloseWithSlippage = priceClose * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
  } else {
    priceOpenWithSlippage = priceOpen * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
    priceCloseWithSlippage = priceClose * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
  }

  const totalFee =
    GLOBAL_CONFIG.CC_PERCENT_FEE *
    (1 + priceCloseWithSlippage / priceOpenWithSlippage);

  let pnlPercentage: number;

  if (signal.position === "long") {
    pnlPercentage =
      ((priceCloseWithSlippage - priceOpenWithSlippage) / priceOpenWithSlippage) * 100;
  } else {
    pnlPercentage =
      ((priceOpenWithSlippage - priceCloseWithSlippage) / priceOpenWithSlippage) * 100;
  }

  pnlPercentage -= totalFee;

  return {
    pnlPercentage,
    priceOpen,
    priceClose,
    pnlCost: (pnlPercentage / 100) * totalInvested,
    pnlEntries: totalInvested,
  };
};

export default toProfitLossDto;
