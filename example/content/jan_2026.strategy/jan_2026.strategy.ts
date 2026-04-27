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
} from "backtest-kit";
import { errorData, getErrorMessage, randomString, str } from "functools-kit";
import { readFileSync } from "fs";
import { SignalEntryModel } from "./model/SignalEntry.model";

const TRAILING_TAKE = 1.0;
const HARD_STOP = 1.0;

const SIGNALS: SignalEntryModel[] = readFileSync(
  "./assets/entry.jsonl",
  "utf-8",
)
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

function getActiveSignal(symbol: string, when: Date): SignalEntryModel | null {
  const now = when.getTime();
  const match = SIGNALS.find(
    (s) => {
      if (s.symbol !== symbol) {
        return false;
      }
      const publishedAt = alignToInterval(new Date(s.publishedAt), "1m");
      return publishedAt.getTime() === now;
    }
  );
  return match ?? null;
}

addStrategySchema({
  strategyName: "jan_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {

    console.log(when)

    const signal = getActiveSignal(symbol, when);

    if (!signal) {
      return null;
    }
    
    const close_1m = await getClosePrice(symbol, "1m");

    if (close_1m < signal.entry.from || close_1m > signal.entry.to) {
      return null;
    }

    const [close_4h_prev, close_4h_cur] = await getCandles(symbol, "4h", 2);

    const range_high = Math.max(close_4h_prev.high, close_4h_cur.high);
    const range_low = Math.max(close_4h_prev.low, close_4h_cur.low);
    const range_middle = range_high + range_low / 2;

    const position = close_1m > range_middle ? "short" : "long";

    console.log({ position, signal })

    return {
      position,
      ...Position.moonbag({
        position,
        currentPrice,
        percentStopLoss: HARD_STOP,
      }),
      minuteEstimatedTime: 24 * 60,
      note: signal.note,
    };
  },
});

/*
listenActivePing(async ({ symbol, data, currentPrice }) => {
  const peakProfitDistance = await getPositionHighestProfitDistancePnlCost(symbol);
  const peakMaxDrawdown = await getPositionHighestMaxDrawdownPnlCost(symbol);
  const currentPnl = await getPositionPnlCost(symbol);
  Log.info("position active", {
    symbol,
    signalId: data.id,
    priceOpen: data.priceOpen,
    takeProfit: data.priceTakeProfit,
    stopLoss: data.priceStopLoss,
    currentPrice,
    peakProfitDistance,
    peakMaxDrawdown,
    currentPnl,
  });
});
*/

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
