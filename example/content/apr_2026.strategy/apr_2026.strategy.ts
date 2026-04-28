import {
  addStrategySchema,
  listenError,
  listenActivePing,
  Log,
  Position,
  commitClosePending,
  getPositionPnlPercent,
  getPositionEntryOverlap,
  getPositionEntries,
  commitAverageBuy,
} from "backtest-kit";
import { errorData, getErrorMessage, str } from "functools-kit";

const HARD_STOP = 25.0;
const TARGET_PROFIT = 3;

const LADDER_STEP_COST = 100;
const LADDER_UPPER_STEP = 5;
const LADDER_LOWER_STEP = 1;

const LADDER_MAX_STEPS = 10;

addStrategySchema({
  strategyName: "apr_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    return {
      position: "long",
      ...Position.moonbag({
        position: "long",
        currentPrice,
        percentStopLoss: HARD_STOP,
      }),
      minuteEstimatedTime: Infinity,
      cost: LADDER_STEP_COST,
    };
  },
});

listenActivePing(async ({ symbol, currentPrice }) => {
  const { length: steps } = await getPositionEntries(symbol);
  if (steps >= LADDER_MAX_STEPS) {
    return;
  }
  const hasOverlap = await getPositionEntryOverlap(symbol, currentPrice, {
    upperPercent: LADDER_UPPER_STEP,
    lowerPercent: LADDER_LOWER_STEP,
  });
  if (hasOverlap) {
    return;
  }
  await commitAverageBuy(symbol, LADDER_STEP_COST);
});


listenActivePing(async ({ symbol, data, timestamp }) => {
  console.log(new Date(timestamp));
  const currentProfit = await getPositionPnlPercent(symbol);
  if (currentProfit < TARGET_PROFIT) {
    return;
  }
  Log.info("position closed due to the target pnl reached", {
    symbol,
    data,
  });
  await commitClosePending(symbol, {
    id: "unknown",
    note: str.newline(
      "# Позиция закрыта по target pnl",
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
