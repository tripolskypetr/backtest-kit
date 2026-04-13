import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { research } from "logic";

const researchSource = Cache.file(
  async (symbol: string, when: Date, currentPrice: number) => {
    const result = await research(symbol, when);
    console.log(result, when);
    return { ...result, currentPrice };
  },
  { interval: "1h", name: "research_source" },
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    await researchSource(symbol, when, currentPrice);
    return null;
  },
});

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
