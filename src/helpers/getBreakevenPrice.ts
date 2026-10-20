import { ISignalDto, ISignalRow } from "../interfaces/Strategy.interface";
import { toProfitLossDto } from "./toProfitLossDto";

interface Signal extends ISignalDto {
  priceOpen: number;
  _entry?: ISignalRow['_entry'];
  _partial?: ISignalRow['_partial'];
  _accruals?: ISignalRow['_accruals'];
}

/** True breakeven: the realizable PNL at this close price is exactly 0%. */
const BREAKEVEN_PNL_PERCENT = 0;

/**
 * Computes the exact COST-AWARE breakeven price — the close price at which the
 * realizable PNL (toProfitLossDto, i.e. slippage + fees + multiplier + DCA
 * entries + partial-close replay included) equals exactly 0%.
 *
 * The raw effective entry price is NOT breakeven: closing there realizes the
 * round-trip costs as a loss of (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2
 * (≈ -0.4% at defaults, scaled by the leverage multiplier). A stop-loss meant
 * to protect capital must sit at the price where the TOTAL trade exits at
 * zero — for LONG slightly above the effective entry, for SHORT slightly
 * below it.
 *
 * Method (mirror of getLiquidationPrice): pnlPercentage is LINEAR in
 * priceClose for a fixed signal state — already-closed partials contribute a
 * constant, the remaining position a linear term, and the fee/slippage
 * adjustments are linear too. Two evaluations of toProfitLossDto recover the
 * line (slope k, intercept b), and the breakeven price is the solution of
 * k * P + b = 0. This inverts the REAL production PNL calculator, so the
 * formula can never drift from it (closing at the returned price yields
 * exactly 0% by construction).
 *
 * Breakeven is a PRICE level: dividend / staking accruals (_accruals) are
 * deliberately excluded. They are money already received, not price exposure,
 * and folding them in would announce breakeven.available and park the stop
 * BELOW the entry right after the first accrual (a 1% dividend puts the
 * "breakeven" at -0.6% from entry). The PNL at the returned price is therefore
 * exactly pnlDividends, not 0, once accruals exist — see toProfitLossDto.
 *
 * Returns null when the PNL does not depend on the close price (k ≈ 0): the
 * remaining position weight is zero (fully closed by partials) — nothing left
 * to protect. A non-positive solution (unreachable with banked partial
 * profits exceeding the remaining exposure) also returns null.
 *
 * @param signal - Signal with position/priceOpen/multiplier and optional _entry/_partial
 * @returns The exact zero-PNL close price, or null when breakeven is undefined
 */
export const getBreakevenPrice = (signal: Signal): number | null => {
  // price-only PNL: accruals stripped (see the note above)
  const priceSignal: Signal = { ...signal, _accruals: [] };
  const p0 = signal.priceOpen;
  const p1 = signal.priceOpen * 0.9;

  const pnl0 = toProfitLossDto(priceSignal, p0).pnlPercentage;
  const pnl1 = toProfitLossDto(priceSignal, p1).pnlPercentage;

  const k = (pnl1 - pnl0) / (p1 - p0);
  if (!Number.isFinite(k) || Math.abs(k) < Number.EPSILON) {
    return null;
  }

  const breakevenPrice = p0 + (BREAKEVEN_PNL_PERCENT - pnl0) / k;
  if (!Number.isFinite(breakevenPrice) || breakevenPrice <= 0) {
    return null;
  }
  return breakevenPrice;
};

export default getBreakevenPrice;
