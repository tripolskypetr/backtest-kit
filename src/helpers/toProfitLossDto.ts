import { ISignalRow, IStrategyPnL } from "../interfaces/Strategy.interface";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Calculates profit/loss for a closed signal with slippage and fees.
 *
 * Formula breakdown:
 * 1. Apply slippage to open/close prices (worse execution)
 *    - LONG: buy higher (+slippage), sell lower (-slippage)
 *    - SHORT: sell lower (-slippage), buy higher (+slippage)
 * 2. Calculate raw PNL percentage
 *    - LONG: ((closePrice - openPrice) / openPrice) * 100
 *    - SHORT: ((openPrice - closePrice) / openPrice) * 100
 * 3. Subtract total fees (0.1% * 2 = 0.2%)
 *
 * @param signal - Closed signal with position details
 * @param priceClose - Actual close price at exit
 * @returns PNL data with percentage and prices
 *
 * @example
 * ```typescript
 * const pnl = toProfitLossDto(
 *   {
 *     position: "long",
 *     priceOpen: 50000,
 *     // ... other signal fields
 *   },
 *   51000 // close price
 * );
 * console.log(pnl.pnlPercentage); // e.g., 1.8% (after slippage and fees)
 * ```
 */
export const toProfitLossDto = (
  signal: ISignalRow,
  priceClose: number
): IStrategyPnL => {
  const priceOpen = signal.priceOpen;

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

  // Применяем комиссию дважды (при открытии и закрытии)
  const totalFee = GLOBAL_CONFIG.CC_PERCENT_FEE * 2;

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
