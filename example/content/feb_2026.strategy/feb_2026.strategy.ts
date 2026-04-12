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
  getPositionHighestMaxDrawdownPnlCost,
  getPositionHighestPnlCost,
  getPositionPnlCost,
  getDate,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { run, File, extract } from "@backtest-kit/pinets";
import { research } from "logic";

const PNL_TRAILING_STOP_PERCENT = 3;
const PNL_HARD_STOP_PERCENT = 2.5;

const MAX_DRAWDOWN_PERCENT = 5;

const POSITION_FILE_SHORT = File.fromPath("position_short.pine", "./math");
const POSITION_FILE_LONG = File.fromPath("position_long.pine", "./math");

const POSITION_FILE_MAP = {
  BUY: POSITION_FILE_LONG,
  SELL: POSITION_FILE_SHORT,
};

const POSITION_LABEL_MAP = {
  BUY: "long",
  SELL: "short",
};

const researchSource = Cache.file(
  async (symbol: string, when: Date, currentPrice: number) => {
    const result = await research(symbol, when);
    return { ...result, currentPrice };
  },
  { interval: "1h", name: "research_source" },
);

const signalSource = Interval.fn(
  async (symbol: string, when: Date, currentPrice: number): Promise<ISignalDto> => {
    const research = await researchSource(symbol, when, currentPrice);
    if (research.signal === "SELL" && currentPrice > research.currentPrice) {
      return null;
    }
    if (research.signal === "BUY" && currentPrice < research.currentPrice) {
      return null;
    }
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
    const { priceStopLoss, priceTakeProfit } = Position.moonbag({
      position,
      currentPrice,
      percentStopLoss: MAX_DRAWDOWN_PERCENT,
    });
    console.log("signal generated", {
      symbol,
      when,
      position,
      priceStopLoss,
      priceTakeProfit,
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
  },
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    const research = await researchSource(symbol, when, currentPrice);
    if (research.signal === "WAIT") {
      return null;
    }
    const signal = await signalSource(symbol, when, currentPrice);
    if (!signal) {
      return null;
    }
    return signal;
  },
});

listenActivePing(async ({ symbol, data }) => {
  const peakProfitDistance = await getPositionHighestProfitDistancePnlCost(symbol);
  const peakMaxDrawdown = await getPositionHighestMaxDrawdownPnlCost(symbol);
  Log.info("position active", {
    symbol,
    data,
    peakProfitDistance,
    peakMaxDrawdown,
  });
});

listenActivePing(async ({ symbol }) => {
  const peakPnl = await getPositionHighestPnlCost(symbol);
  const peakProfitDistance = await getPositionHighestProfitDistancePnlCost(symbol);
  if (peakPnl > 0 && peakProfitDistance > PNL_TRAILING_STOP_PERCENT) {
    Log.info("position trailing stop triggered", {
      symbol,
      peakProfitDistance,
    });
    await commitClosePending(symbol);
  }
});

listenActivePing(async ({ symbol, data }) => {
  const currentPnl = await getPositionPnlCost(symbol);
  if (currentPnl < -PNL_HARD_STOP_PERCENT) {
    Log.info("position hard stop triggered", {
      symbol,
      currentPnl,
    });
    await commitClosePending(symbol);
  }
});

listenActivePing(async ({ symbol, data, currentPrice }) => {
  const when = await getDate();
  const research = await researchSource(symbol, when, currentPrice);
  if (research.signal === "WAIT") {
    return;
  }
  const position = POSITION_LABEL_MAP[research.signal];
  if (position === data.position) {
    return;
  }
  await commitClosePending(symbol);
  Log.info("position closed", {
    symbol,
    data,
  });
});

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
