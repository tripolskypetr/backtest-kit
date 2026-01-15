import { addStrategy } from "backtest-kit";
import { ollama } from "@backtest-kit/ollama";

import { commitHistorySetup } from "../../func/market.func.mjs";

import StrategyName from "../../enum/StrategyName.mjs";
import RiskName from "../../enum/RiskName.mjs";

addStrategy({
  strategyName: StrategyName.MainStrategy,
  interval: "5m",
  getSignal: async (symbol) => {
    const messages = [];

    {
      await commitHistorySetup(symbol, messages);
    }

    return await ollama(
      messages,
      "glm-4.6:cloud",
      process.env.CC_OLLAMA_API_KEY
    );
  },
  riskList: [
    RiskName.TakeProfitDistanceRisk, 
    RiskName.RiskRewardRatioRisk
  ],
});
