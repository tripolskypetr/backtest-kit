import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
  Position,
  listenActivePing,
  commitClosePending,
  getPositionHighestProfitDistancePnlCost,
  getPositionHighestMaxDrawdownPnlCost,
  getCandles,
  getAveragePrice,
  getSymbol,
  getPendingSignal,
} from "backtest-kit";
import { errorData, getErrorMessage, not, randomString, str } from "functools-kit";
import { sourceNode, outputNode, resolve } from "@backtest-kit/graph";
import { research } from "logic";

const NEVER_DRAWDOWN_PERCENT = 5;

const POSITION_LABEL_MAP = {
  BUY: "long",
  SELL: "short",
  WAIT: "wait",
} as const;

const researchSource = sourceNode(
  Cache.file(
    async (symbol: string, when: Date, currentPrice: number) => {
      const result = await research(symbol, when);
      return { ...result, currentPrice };
    },
    { interval: "1h", name: "research_source" },
  )
);

const positionOutput = outputNode(
  async ([research]) => {
    return POSITION_LABEL_MAP[research.signal];
  },
  researchSource,
);

const reversalOutput = outputNode(
  async ([position]) => {
    const symbol = await getSymbol();
    const pendingSignal = await getPendingSignal(symbol);
    if (!pendingSignal) {
      throw new Error("no pending signal");
    }
    if (position === "wait") {
      return false;
    }
    if (position === pendingSignal.position) {
      return false;
    }
    return true;
  },
  positionOutput,
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    const research = await resolve(researchSource);

    const position = await resolve(positionOutput);
    if (position === "wait") {
      return null;
    }

    console.log("signal generated", {
      symbol,
      when,
      position,
    });

    return {
      id: `${research.id}_${randomString()}`,
      ...Position.moonbag({
        position,
        currentPrice,
        percentStopLoss: NEVER_DRAWDOWN_PERCENT,
      }),
      minuteEstimatedTime: Infinity,
      note: str.newline(
        research.reasoning,
        " ",
        `[Research details](/pick-dump-search/${research.id})`,
      ),
    };
  },
});

listenActivePing(async ({ symbol, data }) => {
  const research = await resolve(researchSource);
  if (await not(resolve(reversalOutput))) {
    return;
  }
  await commitClosePending(symbol, {
    id: research.id,
    note: str.newline(
      research.reasoning,
      " ",
      `[Research details](/pick-dump-search/${research.id})`,
    ),
  });
  Log.info("position closed", {
    symbol,
    data,
  });
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

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
