import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
  getAveragePrice,
  Interval,
  ISignalDto,
  Position,
  listenActivePing,
  getPositionHighestProfitMinutes,
  getPositionHighestProfitDistancePnlCost,
  commitClosePending,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { run, File, extract } from "@backtest-kit/pinets";
import { research } from "logic";

const MAX_DRAWDOWN_PERCENT = 3.5;
const MAX_MINUTES_AFTER_PEAK = 60;

const POSITION_FILE_SHORT = File.fromPath("position_short.pine", "../math");
const POSITION_FILE_LONG = File.fromPath("position_long.pine", "../math");

const POSITION_FILE_MAP = {
  BUY: POSITION_FILE_LONG,
  SELL: POSITION_FILE_SHORT,
};

const POSITION_LABEL_MAP = {
  BUY: "long",
  SELL: "short",
};

const researchSource = Cache.file(
  async (symbol: string, when: Date) => {
    console.log("Running research", when);
    const result = await research(symbol, when);
    console.log(result, when);
    return result;
  },
  { interval: "8h", name: "research_source" },
);

const signalSource = Interval.file(
  async (symbol: string, when: Date): Promise<ISignalDto> => {
    const research = await researchSource(symbol, when);
    const file = POSITION_FILE_MAP[research.signal];
    const position = POSITION_LABEL_MAP[research.signal];
    {
      if (research.signal === "WAIT") {
        return null;
      }
      if (!file) {
        return null;
      }
      if (!position) {
        return null;
      }
    }
    const plots = await run(file, {
      symbol,
      timeframe: "1m",
      limit: 100,
    });
    const { activate } = await extract(plots, {
      activate: "Position",
    });
    if (activate !== 1) {
      return null;
    }
    const currentPrice = await getAveragePrice(symbol);
    const { priceStopLoss, priceTakeProfit } = Position.moonbag({
      position,
      currentPrice,
      percentStopLoss: MAX_DRAWDOWN_PERCENT,
    });
    return {
      position,
      priceStopLoss,
      priceTakeProfit,
      note: `Agent research: ${research.id}`,
    };
  },
  {
    interval: "4h",
    name: "signal_source",
  },
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  interval: "1m",
  getSignal: async (symbol, when) => {
    const research = await researchSource(symbol, when);
    if (research.signal === "WAIT") {
      return null;
    }
    const signal = await signalSource(symbol);
    if (!signal) {
      return null;
    }
    return signal;
  },
});

listenActivePing(async ({ symbol }) => {
  const peakMinutes = await getPositionHighestProfitMinutes(symbol);
  const peakDrawdown = await getPositionHighestProfitDistancePnlCost(symbol);
  Log.info("active ping", {
    symbol,
    peakMinutes,
    peakDrawdown,
  });
  if (peakMinutes > MAX_MINUTES_AFTER_PEAK) {
    Log.info("active ping: closing position due to time after peak", {
      symbol,
      peakMinutes,
    });
    await commitClosePending(symbol);
  }
});

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
