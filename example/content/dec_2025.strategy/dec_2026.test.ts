import {
  addStrategySchema,
  listenError,
  Log,
  Interval,
  listenIdlePing,
} from "backtest-kit";
import { run, extract, File } from "@backtest-kit/pinets";
import { errorData, getErrorMessage } from "functools-kit";

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
  stopLoss: "StopLoss",
  takeProfit: "TakeProfit",
  isRanging: "IsRanging",
  volSpike: "VolSpike",
  estimatedTime: "EstimatedTime",
};

const getPlot = Interval.fn(
  async (symbol: string) => {
    const plots = await run(PINE_FILE, { symbol, timeframe: "15m", limit: 100 });
    return await extract(plots, PINE_SCHEMA) 
  }, 
  {
    interval: "1h",
  }
);

addStrategySchema({
  strategyName: "dec_2025_strategy",
  getSignal: async (_symbol, when) => {
    console.log(when);
    return null;
  },
});

listenIdlePing(async ({ symbol }) => {
  const dump = await getPlot(symbol);
  if (!dump) {
    return;
  }
  Log.info("position dump", {
    symbol,
    dump,
  });
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
