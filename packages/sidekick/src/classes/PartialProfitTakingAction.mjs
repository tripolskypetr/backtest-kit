import { ActionBase, Constant, commitPartialProfit } from "backtest-kit";

/**
 * Scale out at Kelly-optimized levels
 */
export class PartialProfitTakingAction extends ActionBase {
  async partialProfitAvailable({ symbol, level }) {
    if (level === Constant.TP_LEVEL3) {
      await commitPartialProfit(symbol, 33);
    }
    if (level === Constant.TP_LEVEL2) {
      await commitPartialProfit(symbol, 33);
    }
    if (level === Constant.TP_LEVEL1) {
      await commitPartialProfit(symbol, 34);
    }
  }
}

export default PartialProfitTakingAction;
