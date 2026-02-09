import { ActionBase, commitTrailingStop } from "backtest-kit";

/**
 * Lowers trailing-stop by 3 points when breakeven is reached (ignores volatility)
 * @implements {bt.IPublicAction}
 */
export class BacktestLowerStopOnBreakevenAction extends ActionBase {
  /**
   * 
   * @param {bt.BreakevenContract} param0 
   */
  async breakevenAvailable({ symbol, currentPrice }) {
    // Lower trailing-stop by 3 points (negative value brings stop-loss closer to entry)
    await commitTrailingStop(symbol, -3, currentPrice);
  }
}

export default BacktestLowerStopOnBreakevenAction;
