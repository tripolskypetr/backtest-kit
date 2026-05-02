import {
  addStrategySchema,
  listenError,
  Log,
  Position,
  Cache,
  getCandles,
  Interval,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { trainTrendNetwork } from "./utils/trainTrendNetwork";
import { predictNextClose } from "./utils/predictNextClose";

const TRAIN_CANDLES = 50;
const WINDOW_CANDLES = 8; 

const getPrediction = Cache.fn(
  async (symbol: string) => {
    const candles = await getCandles(symbol, "8h", TRAIN_CANDLES + WINDOW_CANDLES);

    const trainCandles = candles.slice(0, TRAIN_CANDLES);
    const testCandles = candles.slice(TRAIN_CANDLES);

    const model = await trainTrendNetwork(trainCandles);
    const lastCandle = testCandles[testCandles.length - 1];
    
    return predictNextClose(model, testCandles, {
      low: lastCandle.low,
      high: lastCandle.high,
    });
  },
  { interval: "8h" },
)

const getSignal = Interval.fn(
  async (symbol: string, currentPrice: number) => {
    const prediction = await getPrediction(symbol);
  
    if (currentPrice < prediction.price) {
      return {
        ...Position.bracket({
          position: "long",
          currentPrice,
          percentTakeProfit: 2,
          percentStopLoss: 2,
        }),
        minuteEstimatedTime: WINDOW_CANDLES * 60,
        note: JSON.stringify(prediction),
      }
    }
    if (currentPrice > prediction.price) {
      return {
        ...Position.bracket({
          position: "short",
          currentPrice,
          percentTakeProfit: 2,
          percentStopLoss: 2,
        }),
        minuteEstimatedTime: WINDOW_CANDLES * 60,
        note: JSON.stringify(prediction),
      }
    }
  },
  { interval: "15m" }
)

addStrategySchema({
  strategyName: "oct_2021_strategy",
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
