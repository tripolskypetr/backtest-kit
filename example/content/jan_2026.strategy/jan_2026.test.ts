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
} from "backtest-kit";
import { errorData, getErrorMessage, randomString } from "functools-kit";
import { readFileSync } from "fs";

interface ISignalEntry {
  publishedAt: string;
  symbol: string;
  direction: "long" | "short";
  entry: { from: number; to: number };
  targets: number[];
  stoploss: number;
  note: string;
}

const SIGNALS: ISignalEntry[] = readFileSync(
  "./assets/entry.jsonl",
  "utf-8",
)
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

function getActiveSignal(symbol: string, when: Date): ISignalEntry | null {
  const now = when.getTime();
  const match = SIGNALS.find(
    (s) => {
      if (s.symbol === symbol) {
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
  getSignal: async (symbol, when) => {

    console.log(when)

    const signal = getActiveSignal(symbol, when);

    if (!signal) {
      return null;
    }

    /*
     * // signal not in range of prediction
     * // does not matter for dumb money - they will market buy anyway
     * const closePrice = await getClosePrice(symbol, "1m");
     * if (closePrice < signal.entry.from || closePrice > signal.entry.to) {
     *   return null;
     * }
     */

    const priceTakeProfit = signal.targets[signal.targets.length - 1];
    const priceStopLoss = signal.stoploss;

    console.log(signal)

    const id = randomString();

    const close_1m = await getClosePrice(symbol, "1m");
    const close_5m = await getClosePrice(symbol, "5m");
    const close_15m = await getClosePrice(symbol, "15m");
    const close_1h = await getClosePrice(symbol, "1h");
    const close_4h = await getClosePrice(symbol, "4h");
    const close_8h = await getClosePrice(symbol, "8h");

    Log.log("position open", {
      id,
      signal,
      close_1m,
      close_5m,
      close_15m,
      close_1h,
      close_4h,
      close_8h,
    })

    return {
      position: signal.direction,
      priceTakeProfit,
      priceStopLoss,
      minuteEstimatedTime: 240,
      note: signal.note,
    };
  },
});

listenSignal(async ({ symbol, action, signal }) => {
  if (action !== "closed") {
    return;
  }
  
  const close_1m = await getClosePrice(symbol, "1m");
  const close_5m = await getClosePrice(symbol, "5m");
  const close_15m = await getClosePrice(symbol, "15m");
  const close_1h = await getClosePrice(symbol, "1h");
  const close_4h = await getClosePrice(symbol, "4h");
  const close_8h = await getClosePrice(symbol, "8h");

  Log.log("position close", {
    id: signal.id,
    signal,
    close_1m,
    close_5m,
    close_15m,
    close_1h,
    close_4h,
    close_8h,
  })
})

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
