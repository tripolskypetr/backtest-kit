import {
  addStrategySchema,
  listenError,
  Log,
  Position,
  Cache,
  getCandles,
  Interval,
} from "backtest-kit";
import { errorData, getErrorMessage, singleshot } from "functools-kit";
import { readFile } from "fs/promises";
import { runPythonStrategy } from "./utils/interop";

type Signal = "BUY" | "SELL";

const PYTHON_FILE_PATH = "./source/strategy.py";

const getPythonSignal = Cache.fn(
  async (symbol: string): Promise<Signal>  => {
    const candles = await getCandles(symbol, "8h", 50);
    const { signal } = await runPythonStrategy(PYTHON_FILE_PATH, candles);
    return signal;
  },
  { interval: "8h" },
)

const getSignal = Interval.fn(
  async (symbol: string, currentPrice: number) => {
    const signal = await getPythonSignal(symbol);
  
    if (signal === "BUY") {
      return {
        ...Position.bracket({
          position: "long",
          currentPrice,
          percentTakeProfit: 2,
          percentStopLoss: 2,
        }),
        minuteEstimatedTime: 8 * 60,
      }
    }
    if (signal === "SELL") {
      return {
        ...Position.bracket({
          position: "short",
          currentPrice,
          percentTakeProfit: 2,
          percentStopLoss: 2,
        }),
        minuteEstimatedTime: 8 * 60,
      }
    }
  },
  { interval: "8h" }
)

addStrategySchema({
  strategyName: "feb_2021_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    console.log(when);
    return await getSignal(symbol, currentPrice);
  },
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
