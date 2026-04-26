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
} from "backtest-kit";
import { errorData, getErrorMessage, randomString, str } from "functools-kit";
import { readFileSync } from "fs";
import { SignalEntryModel } from "./model/SignalEntry.model";

// не активировать trailing take пока позиция не набрала достаточно прибыли
const TRAILING_TAKE_ACTIVATION = 1.5;
// минимальный trailing take — не выскакивать раньше чем на 0.75% от пика
const TRAILING_TAKE_MIN = 0.75;
// масштабирование: чем больше накоплено, тем шире даём качаться
const TRAILING_TAKE_SCALE = 0.15;
// статистически недостижимый стоп — страховка от чёрного лебедя
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

    const rangeHigh = Math.max(close_4h_prev.high, close_4h_cur.high);
    const rangeLow  = Math.min(close_4h_prev.low,  close_4h_cur.low);
    const posInRange = (close_1m - rangeLow) / (rangeHigh - rangeLow);

    const position = posInRange > 0.65 ? "short" 
               : posInRange < 0.50 ? "long" 
               : null; 

    if (when.toISOString() === "2026-01-06T10:16:00.000Z") {
      debugger;
    }

    if (!position) {
      debugger
      return null;
    }

    console.log(signal)

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


listenActivePing(async ({ symbol, data }) => {
  const peakProfitDistance = await getPositionHighestProfitDistancePnlPercentage(symbol);
  const peakProfit = await getPositionHighestPnlPercentage(symbol);
  const currentProfit = await getPositionPnlPercent(symbol);

  // trailing take: выход из прибыльной позиции при откате от пика
  if (currentProfit < 0) {
    return;
  }

  if ((peakProfit ?? 0) < TRAILING_TAKE_ACTIVATION) {
    return;
  }

  // trailing растёт вместе с накопленной прибылью: на +16% peak даёт 2.4%, на +3% — 0.75%
  const trailingThreshold = Math.max(TRAILING_TAKE_MIN, (peakProfit ?? 0) * TRAILING_TAKE_SCALE);

  if (peakProfitDistance < trailingThreshold) {
    return;
  }

  Log.info("position closed due to the trailing take", {
    symbol,
    data,
    peakProfit,
    trailingThreshold,
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
