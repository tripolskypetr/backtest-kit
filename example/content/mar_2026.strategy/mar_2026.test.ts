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
const TARGET_PROFIT = 0.5;

const LADDER_STEP_COST = 100;

addStrategySchema({
  strategyName: "mar_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    return {
      position: "short",
      ...Position.moonbag({
        position: "short",
        currentPrice,
        percentStopLoss: HARD_STOP,
      }),
      minuteEstimatedTime: 24 * 60,
      cost: LADDER_STEP_COST,
    };
  },
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
