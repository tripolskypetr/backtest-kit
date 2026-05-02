import {
  addStrategySchema,
  listenError,
  Log,
  Position,
  Cache,
  getCandles,
  Interval,
  commitClosePending,
  getPositionPnlPercent,
  getPositionHighestProfitDistancePnlPercentage,
  listenActivePing,
} from "backtest-kit";
import { errorData, getErrorMessage, str } from "functools-kit";
import { trainTrendNetwork } from "./utils/trainTrendNetwork";
import { predictNextClose } from "./utils/predictNextClose";

const TRAIN_CANDLES = 50;
const WINDOW_CANDLES = 8; 

const TRAILING_TAKE = 1.0;
const HARD_STOP = 1.0;

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
        ...Position.moonbag({
          position: "long",
          currentPrice,
          percentStopLoss: HARD_STOP,
        }),
        minuteEstimatedTime: Infinity,
        note: JSON.stringify(prediction),
      }
    }

    return null;
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

listenActivePing(async ({ symbol, data }) => {
  const peakProfitDistance = await getPositionHighestProfitDistancePnlPercentage(symbol);
  const currentProfit = await getPositionPnlPercent(symbol);
  if (currentProfit < 0) {
    return;
  }
  if (peakProfitDistance < TRAILING_TAKE) {
    return;
  }
  Log.info("position closed due to the trailing take", {
    symbol,
    data,
  });
  await commitClosePending(symbol, {
    id: "unknown",
    note: str.newline(
      "# Позиция закрыта по trailing take",
    ),
  });
});


listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
