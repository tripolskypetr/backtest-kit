import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
  ISignalDto,
  Position,
  listenActivePing,
  getPositionHighestProfitDistancePnlCost,
  commitClosePending,
  getPositionHighestMaxDrawdownPnlCost,
  getDate,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { research } from "logic";
import { predict } from 'garch';

const MAX_DRAWDOWN_PERCENT = 50;

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

const signalSource = async (
  symbol: string,
  when: Date,
  currentPrice: number,
): Promise<ISignalDto> => {
  const research = await researchSource(symbol, when, currentPrice);
  const position = POSITION_LABEL_MAP[research.signal];
  {
    if (research.signal === "WAIT") {
      return null;
    }
    if (!position) {
      return null;
    }
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
    currentPrice,
  });
  return {
    position,
    priceStopLoss,
    priceTakeProfit,
    note: `Agent research: ${research.id}`,
  };
};

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
  const peakProfitDistance =
    await getPositionHighestProfitDistancePnlCost(symbol);
  const peakMaxDrawdown = await getPositionHighestMaxDrawdownPnlCost(symbol);
  Log.info("position active", {
    symbol,
    data,
    peakProfitDistance,
    peakMaxDrawdown,
  });
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
