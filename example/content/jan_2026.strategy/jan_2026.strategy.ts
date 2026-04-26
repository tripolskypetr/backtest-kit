import {
  addStrategySchema,
  listenError,
  listenActivePing,
  commitTrailingTakeCost,
  getDate,
  getAveragePrice,
  Log,
  alignToInterval,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { readFileSync } from "fs";

interface ISignalEntry {
  publishedAt: string;
  symbol: string;
  direction: "long" | "short";
  entry: { from: number; to: number };
  targets: number[];
  stoploss: number;
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
  getSignal: async (symbol, when, currentPrice) => {

    console.log(when);

    if (when.toISOString() === "2026-01-06T10:16:16.000Z") {
      debugger;
    }

    const signal = getActiveSignal(symbol, when);

    if (!signal) {
      return null;
    }

    const priceOpen = (signal.entry.from + signal.entry.to) / 2;
    const priceTakeProfit = signal.targets[signal.targets.length - 1];
    const priceStopLoss = signal.stoploss;

    const publishedAt = new Date(signal.publishedAt).getTime();
    const minuteEstimatedTime = Math.ceil(
      (30 * 24 * 60 * 60 * 1000 - (when.getTime() - publishedAt)) / 60_000,
    );

    console.log(signal)

    return {
      position: signal.direction,
      priceOpen,
      priceTakeProfit,
      priceStopLoss,
      minuteEstimatedTime: Math.max(minuteEstimatedTime, 60),
      note: `Signal published at ${signal.publishedAt}, targets: ${signal.targets.join(", ")}`,
    };
  },
});

listenActivePing(async ({ symbol, data }) => {
  const when = await getDate();
  const signal = getActiveSignal(symbol, when);
  if (!signal) {
    return;
  }

  const currentPrice = await getAveragePrice(symbol);

  for (const target of signal.targets.slice(0, -1)) {
    const isLong = data.position === "long";
    const targetReached = isLong
      ? currentPrice >= target
      : currentPrice <= target;
    if (targetReached) {
      await commitTrailingTakeCost(symbol, target);
      break;
    }
  }
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
