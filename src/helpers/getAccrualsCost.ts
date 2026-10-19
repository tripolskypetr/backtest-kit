import { ISignalAccrual } from "../interfaces/Strategy.interface";

interface Signal {
  _accruals?: ISignalAccrual[];
}

/**
 * USD value of the dividend / staking accruals of a position at a given price.
 *
 * - "cash" accruals count as their amount (quote currency, fixed once paid);
 * - "asset" accruals (staking rewards paid in the traded asset) count as
 *   amount × price — they keep moving with the position until it closes.
 *
 * Linear in price, which keeps toProfitLossDto linear in priceClose and lets
 * getBreakevenPrice / getLiquidationPrice keep inverting it exactly.
 *
 * @param signal - Signal with optional _accruals
 * @param price - Price used to value asset accruals (the PNL price)
 * @returns Accrual value in USD (0 when there are none)
 */
export const getAccrualsCost = (signal: Signal, price: number): number => {
  const accruals = signal._accruals ?? [];
  let total = 0;
  for (const accrual of accruals) {
    total += accrual.type === "asset" ? accrual.amount * price : accrual.amount;
  }
  return total;
};

export default getAccrualsCost;
