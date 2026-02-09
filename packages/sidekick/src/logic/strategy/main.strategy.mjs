import { addStrategySchema } from "backtest-kit";
import { randomString } from "functools-kit";

import * as math_15m from "../../math/timeframe_15m.math.mjs";
import * as math_4h from "../../math/timeframe_4h.math.mjs";

import StrategyName from "../../enum/StrategyName.mjs";
import RiskName from "../../enum/RiskName.mjs";

addStrategySchema({
  strategyName: StrategyName.MainStrategy,
  interval: "5m",
  getSignal: async (symbol) => {

    const signalId = randomString();
    
    const data_4h = await math_4h.getData(signalId, symbol);

    if (data_4h.noTrades) {
      return null;
    }

    const data_15m = await math_15m.getData(signalId, symbol);

    if (data_15m.position === 0) {
      return null;
    }

    if (data_4h.allowShort && data_15m.position === 1) {
      return null;
    }

    if (data_4h.allowLong && data_15m.position === -1) {
      return null;
    }

    {
      math_15m.dumpPlot(signalId, symbol);
      math_4h.dumpPlot(signalId, symbol);
    }

    return await math_15m.getSignal(signalId, symbol);
  },
  riskList: [
    RiskName.TakeProfitDistanceRisk, 
    RiskName.StopLossDistanceRisk
  ],
});
