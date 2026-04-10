import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
  getAveragePrice,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { research } from "logic";

const researchSource = Cache.file(
  async (symbol: string, when: Date) => {
    console.log("Running research", when);
    return await research(symbol, when);
  },
  { interval: "8h", name: "research_source" },
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  interval: "1m",
  getSignal: async (symbol, when) => {
    const research = await researchSource(symbol, when);

    return null;
  },
});

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
