import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
  getAveragePrice,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { position, research } from "../../logic";
import { ResearchResponseContract } from "../../logic/contract/ResearchResponse.contract";

const researchSource = Cache.file(
  async (symbol: string, when: Date) => {
    return await research(symbol, when);
  },
  { interval: "1d", name: "research_source" },
);

const positionSource = Cache.fn(
  async (symbol: string, when: Date, research: ResearchResponseContract) => {
    return await position(research, symbol, when);
  },
  { interval: "1h", key: ([symbol]) => symbol },
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  interval: "1m",
  getSignal: async (symbol, when) => {
    const research = await researchSource(symbol, when);

    if (research.signal === "WAIT") {
      return null;
    }

    const position = await positionSource(symbol, when, research);

    if (position.action === "WAIT") {
      return null;
    }

    const signalMap = {
      BUY: "long",
      SELL: "short",
    } as const;

    const open = await getAveragePrice(symbol);
    const isLong = research.signal === "BUY";

    const priceTakeProfit = isLong ? open * 1.01 : open * 0.99;
    const priceStopLoss = isLong ? open * 0.98 : open * 1.02;

    return {
      id: position.id,
      position: signalMap[research.signal],
      priceTakeProfit,
      priceStopLoss,
      minuteEstimatedTime: Infinity,
      note: position.reasoning,
    };
  },
});

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
