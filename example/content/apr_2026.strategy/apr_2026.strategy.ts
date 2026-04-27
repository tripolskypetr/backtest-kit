import {
  addStrategySchema,
  listenError,
  listenActivePing,
  commitTrailingTakeCost,
  getDate,
  getAveragePrice,
  Log,
  listenIdlePing,
  alignToInterval,
  getClosePrice,
  listenSignal,
  Position,
  commitClosePending,
  getPositionHighestProfitDistancePnlPercentage,
  getPositionHighestPnlPercentage,
  getPositionPnlPercent,
  getCandles,
  getPositionHighestProfitDistancePnlCost,
  getPositionHighestMaxDrawdownPnlCost,
  getPositionPnlCost,
  getPositionHighestPnlCost,
  getPositionHighestProfitMinutes,
  getAggregatedTrades,
  Cache,
} from "backtest-kit";
import { errorData, getErrorMessage, str } from "functools-kit";
import * as anomaly from "volume-anomaly";

const PEAK_STALENESS_SINCE_PROFIT = 1.0;
const PEAK_STALENESS_SINCE_MINUTES = 240;

const TRAILING_TAKE = 1.0;
const HARD_STOP = 1.0;

const ANOMALY_CONFIDENCE = 0.75; // volume-anomaly composite score
const N_TRAIN = 1200; // baseline count
const N_DETECT = 200; // detection window

const getExecutedTradesSkew = Cache.fn(
  async (symbol: string) => {
    const all = await getAggregatedTrades(symbol, N_TRAIN + N_DETECT);
    return anomaly.predict(
      all.slice(0, N_TRAIN),
      all.slice(N_TRAIN),
      ANOMALY_CONFIDENCE,
    );
  },
  { interval: "5m" }
);

addStrategySchema({
  strategyName: "apr_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {

    console.log(when);

    const skew = await getExecutedTradesSkew(symbol);

    if (!skew.anomaly) {
      return null;
    }

    if (skew.direction === "neutral") {
      return null;
    }

    return {
      position: skew.direction,
      ...Position.moonbag({
        position: skew.direction,
        currentPrice,
        percentStopLoss: HARD_STOP,
      }),
      minuteEstimatedTime: Infinity,
    };
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

listenActivePing(async ({ symbol, data }) => {
  const peakProfitCost = await getPositionHighestPnlPercentage(symbol);
  const peakProfitMinutes = await getPositionHighestProfitMinutes(symbol);
  if (peakProfitCost < PEAK_STALENESS_SINCE_PROFIT) {
    return;
  }
  if (peakProfitMinutes < PEAK_STALENESS_SINCE_MINUTES) {
    return;
  }
  Log.info("position closed due to the peak staleness", {
    symbol,
    data,
  });
  await commitClosePending(symbol, {
    id: "unknown",
    note: str.newline(
      "# Позиция закрыта по peak staleness",
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
