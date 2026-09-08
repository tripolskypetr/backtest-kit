import { ISignalDto, ISignalRow } from "../interfaces/Strategy.interface";
import { toProfitLossDto } from "./toProfitLossDto";

interface Signal extends ISignalDto {
  priceOpen: number;
  _entry?: ISignalRow['_entry'];
  _partial?: ISignalRow['_partial'];
}

/**
 * Isolated-margin liquidation threshold: the position's margin is its own
 * cost, so it is force-closed once the leveraged realizable PNL reaches -100%.
 */
const LIQUIDATION_PNL_PERCENT = -100;

/**
 * Computes the exact liquidation price for an isolated-margin position — the
 * close price at which the leveraged realizable PNL (toProfitLossDto, i.e.
 * slippage + fees + multiplier + DCA entries + partial-close replay included)
 * equals exactly -100%.
 *
 * Method: pnlPercentage is LINEAR in priceClose for a fixed signal state —
 * already-closed partials contribute a constant, the remaining position
 * contributes a linear term, and the fee/slippage adjustments are linear too.
 * Two evaluations of toProfitLossDto recover the line (slope k, intercept b),
 * and the liquidation price is the solution of k * P + b = -100. This inverts
 * the REAL production PNL calculator, so the formula can never drift from it
 * (closing at the returned price yields exactly -100% by construction).
 *
 * Returns null when the PNL does not depend on the close price (k ≈ 0): the
 * remaining position weight is zero (fully closed by partials) — nothing left
 * to liquidate.
 *
 * NOTE: the returned price may be non-positive for low leverage (e.g. 1x
 * cannot lose 100% before the price itself reaches ~0). Callers treat a
 * non-positive result the same as null — liquidation unreachable.
 *
 * @param signal - Signal with position/priceOpen/multiplier and optional _entry/_partial
 * @returns The exact liquidation price, or null when liquidation is unreachable
 */
export const getLiquidationPrice = (signal: Signal): number | null => {
  const p0 = signal.priceOpen;
  const p1 = signal.priceOpen * 0.9;

  const pnl0 = toProfitLossDto(signal, p0).pnlPercentage;
  const pnl1 = toProfitLossDto(signal, p1).pnlPercentage;

  const k = (pnl1 - pnl0) / (p1 - p0);
  if (!Number.isFinite(k) || Math.abs(k) < Number.EPSILON) {
    return null;
  }

  const liquidationPrice = p0 + (LIQUIDATION_PNL_PERCENT - pnl0) / k;
  if (!Number.isFinite(liquidationPrice) || liquidationPrice <= 0) {
    return null;
  }
  return liquidationPrice;
};

export default getLiquidationPrice;
