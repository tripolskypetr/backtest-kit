import { addStrategySchema, commitSignalPromptHistory, dumpSignalData } from "backtest-kit";
import { ollama } from "@backtest-kit/ollama";

import { commitHistorySetup } from "../../func/market.func.mjs";

import StrategyName from "../../enum/StrategyName.mjs";
import RiskName from "../../enum/RiskName.mjs";

import { CC_OLLAMA_API_KEY } from "../../config/params.mjs";

addStrategySchema({
  strategyName: StrategyName.MainStrategy,
  interval: "5m",
  getSignal: async (symbol) => {
    const messages = [];

    {
      await commitHistorySetup(symbol, messages);
    }

    await commitSignalPromptHistory(symbol, messages);

    const signalData = await ollama(
      messages,
      "glm-4.6:cloud",
      CC_OLLAMA_API_KEY
    );

    if (!signalData) {
      return null;
    }

    dumpSignalData(signalData.id, messages, signalData);

    return signalData;
  },
  riskList: [
    RiskName.TakeProfitDistanceRisk, 
    RiskName.StopLossDistanceRisk,
  ],
});
