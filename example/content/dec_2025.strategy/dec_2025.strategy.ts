import {
  addStrategySchema,
  Interval,
  listenError,
  Log,
  Position,
} from "backtest-kit";
import { run, extract, File } from "@backtest-kit/pinets";
import { errorData, getErrorMessage, str } from "functools-kit";

const PINE_FILE = File.fromPath("btc_dec2025_range.pine", "./math");

const PINE_SCHEMA = {
  bbUpper: "BB Upper",
  bbLower: "BB Lower",
  bbBasis: "BB Basis",
  rangeHigh: "Range High",
  rangeLow: "Range Low",
  signalLine: "Signal Line",
  close: "Close",
  signal: "Signal",
  isRanging: "IsRanging",
  volSpike: "VolSpike",
};

const PINE_INPUTS = {
  rsi_len: 14,
};

const getPlot = Interval.fn(
  async (symbol: string) => {
    const plots = await run(PINE_FILE, { 
      symbol, 
      inputs: PINE_INPUTS,
      timeframe: "1h", 
      limit: 100,
    });
    return await extract(plots, PINE_SCHEMA) 
  }, 
  {
    interval: "1h",
  }
);

addStrategySchema({
  strategyName: "dec_2025_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    console.log(when);
    const plot = await getPlot(symbol);
  
    if (plot?.signal === 1) {

      if (currentPrice > plot.close) {
        return null;
      }

      return {
        ...Position.bracket({
          position: "long",
          currentPrice,
          percentTakeProfit: 2,
          percentStopLoss: 2,
        }),
        minuteEstimatedTime: Infinity,
      }
    }
    if (plot?.signal === -1) {

      if (currentPrice < plot.close) {
        return null;
      }

      return {
        ...Position.bracket({
          position: "short",
          currentPrice,
          percentTakeProfit: 2,
          percentStopLoss: 2,
        }),
        minuteEstimatedTime: Infinity,
      }
    }
  
    return null;
  },
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
