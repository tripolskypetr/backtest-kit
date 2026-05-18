import {
  addStrategySchema,
  listenError,
  listenActivePing,
  Log,
  commitClosePending,
  getPendingSignal,
  getDate,
  alignToInterval,
  Position,
} from "backtest-kit";
import { errorData, getErrorMessage, str } from "functools-kit";

const HOLD_MINUTES = 24 * 60;
const HARD_STOP_PERCENT = 50;

interface IPolySignal {
  dateISO: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
}

const POLY_SIGNALS: IPolySignal[] = [
  { dateISO: "2024-04-04T00:00:03.000Z", direction: "long",  entryPrice: 68487.79, exitPrice: 67820.62 },
  { dateISO: "2024-04-05T00:00:03.000Z", direction: "long",  entryPrice: 67820.62, exitPrice: 68896.00 },
  { dateISO: "2024-04-06T00:00:03.000Z", direction: "short", entryPrice: 68896.00, exitPrice: 69360.39 },
  { dateISO: "2024-04-07T00:00:02.000Z", direction: "long",  entryPrice: 69360.39, exitPrice: 71620.00 },
  { dateISO: "2024-04-08T00:00:03.000Z", direction: "long",  entryPrice: 71620.00, exitPrice: 69146.00 },
  { dateISO: "2024-04-09T00:00:03.000Z", direction: "long",  entryPrice: 69146.00, exitPrice: 70631.08 },
  { dateISO: "2024-04-10T00:00:03.000Z", direction: "short", entryPrice: 70631.08, exitPrice: 70006.23 },
  { dateISO: "2024-04-11T00:00:03.000Z", direction: "long",  entryPrice: 70006.23, exitPrice: 67116.52 },
  { dateISO: "2024-04-12T00:00:03.000Z", direction: "short", entryPrice: 67116.52, exitPrice: 63924.51 },
  { dateISO: "2024-04-13T00:00:02.000Z", direction: "short", entryPrice: 63924.51, exitPrice: 65661.84 },
  { dateISO: "2024-04-14T00:00:03.000Z", direction: "short", entryPrice: 65661.84, exitPrice: 63419.99 },
  { dateISO: "2024-04-15T00:00:03.000Z", direction: "long",  entryPrice: 63419.99, exitPrice: 63793.39 },
  { dateISO: "2024-04-16T00:00:03.000Z", direction: "short", entryPrice: 63793.39, exitPrice: 61277.37 },
  { dateISO: "2024-04-17T00:00:03.000Z", direction: "short", entryPrice: 61277.37, exitPrice: 63470.08 },
  { dateISO: "2024-04-18T00:00:03.000Z", direction: "short", entryPrice: 63470.08, exitPrice: 63818.01 },
  { dateISO: "2024-04-20T00:00:02.000Z", direction: "long",  entryPrice: 64940.59, exitPrice: 64941.15 },
  { dateISO: "2024-04-22T00:00:03.000Z", direction: "long",  entryPrice: 66819.32, exitPrice: 66414.00 },
  { dateISO: "2024-04-23T00:00:02.000Z", direction: "long",  entryPrice: 66414.00, exitPrice: 64289.59 },
  { dateISO: "2024-04-24T00:00:03.000Z", direction: "short", entryPrice: 64289.59, exitPrice: 64498.34 },
  { dateISO: "2024-04-25T00:00:03.000Z", direction: "short", entryPrice: 64498.34, exitPrice: 63770.01 },
  { dateISO: "2024-04-26T00:00:02.000Z", direction: "long",  entryPrice: 63770.01, exitPrice: 63461.98 },
  { dateISO: "2024-04-27T00:00:03.000Z", direction: "short", entryPrice: 63461.98, exitPrice: 63118.62 },
  { dateISO: "2024-04-28T00:00:03.000Z", direction: "long",  entryPrice: 63118.62, exitPrice: 63866.00 },
  { dateISO: "2024-04-30T00:00:04.000Z", direction: "short", entryPrice: 60672.00, exitPrice: 58364.97 },
];

addStrategySchema({
  strategyName: "apr_2026_strategy",
  interval: "1m",
  getSignal: async (symbol, when, currentPrice) => {

    console.log(symbol, when);
    
    const sig = POLY_SIGNALS.find(({ dateISO }) => alignToInterval(new Date(dateISO), "1m").toString() === when.toString());

    if (!sig) {
      return null;
    }

    console.log(sig);

    return {
      position: sig.direction,
      ...Position.moonbag({
        currentPrice,
        position: sig.direction,
        percentStopLoss: HARD_STOP_PERCENT,
      }),
      minuteEstimatedTime: HOLD_MINUTES,
      note: str.newline(
        `# Polymarket Δprob сигнал ${sig.direction}`,
        `entry=${sig.entryPrice} exit=${sig.exitPrice}`,
      ),
    };
  },
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
