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
  { interval: "4h", name: "forecast_source" },
);

const reactionSource = Cache.fn(
  async (symbol: string, when: Date, currentPrice: number) => {
    const forecast = await forecastSource(symbol, when, currentPrice);
    const result = await reaction(forecast, symbol, when);
    console.log(result, when);
    return { ...result, currentPrice };
  },
  { interval: "4h" }
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    const { sentiment } = await forecastSource(symbol, when, currentPrice);
    if (sentiment === "bullish") {
      await reactionSource(symbol, when, currentPrice);
    }
    if (sentiment === "bearish") {
      await reactionSource(symbol, when, currentPrice);
    }
    return null;
  },
});

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
