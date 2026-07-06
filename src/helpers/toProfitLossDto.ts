import { ISignalDto, ISignalRow, IStrategyPnL } from "../interfaces/Strategy.interface";
import { GLOBAL_CONFIG } from "../config/params";
import { getEffectivePriceOpen, computeEffectivePriceAtPartial } from "./getEffectivePriceOpen";

interface Signal extends ISignalDto {
  priceOpen: number;
  _entry?: ISignalRow['_entry'];
  _partial?: ISignalRow['_partial'];
}

/**
 * Относительная составляющая допуска для guard'а «партиалы превысили вложения».
 *
 * Кап партиалов (PARTIAL_CAP_TOLERANCE_FACTOR в ClientStrategy) пропускает
 * floating-point дрейф до totalInvested × 1e-9 НА ШАГ, а этот guard заново
 * суммирует весь реплей partial-истории — дрейф накапливается по шагам, поэтому
 * запас на порядок шире (1e-8). Чисто абсолютный порог ($0.001) отвергал
 * легитимное 100%-закрытие позиции с крупным кастомным cost (>$1M): центы
 * ULP-шума double — это не превышение вложений. Реальный перебор (проценты,
 * а не 1e-8 относительных) по-прежнему отсекается.
 */
const PARTIAL_OVERCLOSE_RELATIVE_TOLERANCE = 1e-8;

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
  signal: Signal,
  priceClose: number
): IStrategyPnL => {
  const entries = signal._entry ?? [];
  // Fallback for signals without _entry (loaded from old persistence): use the
  // signal's own cost — the constant would corrupt the dollar basis of a
  // position opened with a custom cost.
  const totalInvested = entries.length > 0
    ? entries.reduce((s, e) => s + e.cost, 0)
    : signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST;

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

    // Допуск absolute-OR-relative: см. PARTIAL_OVERCLOSE_RELATIVE_TOLERANCE
    if (closedDollarValue > totalInvested + Math.max(0.001, totalInvested * PARTIAL_OVERCLOSE_RELATIVE_TOLERANCE)) {
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
