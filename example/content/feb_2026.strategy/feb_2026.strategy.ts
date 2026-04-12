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
  async (symbol: string, when: Date) => {
    const result = await research(symbol, when);
    return result;
  },
  { interval: "8h", name: "research_source" },
);

const signalSource = Interval.fn(
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
  interval: "1m",
  getSignal: async (symbol, when) => {
    const research = await researchSource(symbol, when);
    if (research.signal === "WAIT") {
      return null;
    }
    const signal = await signalSource(symbol, when);
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

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
