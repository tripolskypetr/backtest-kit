import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { grid } from "logic";

const gridSource = Cache.file(
  async (symbol: string, when: Date) => {
    const result = await grid(symbol, when);
    return result;
  },
  { interval: "8h", name: "grid_source" },
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  getSignal: async (symbol, when) => {
    await gridSource(symbol, when);
    return null;
  },
});

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
