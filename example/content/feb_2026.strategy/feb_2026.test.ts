import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { forecast, reaction } from "logic";

const forecastSource = Cache.file(
  async (symbol: string, when: Date, currentPrice: number) => {
    const result = await forecast(symbol, when);
    console.log(result, when);
    return { ...result, currentPrice };
  },
  { interval: "1d", name: "forecast_source" },
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    await forecastSource(symbol, when, currentPrice);
    return null;
  },
});

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
