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
import { predict } from "garch";
import { errorData, getErrorMessage, not } from "functools-kit";
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

const sigmaSource = sourceNode(
  Cache.fn(
    async (symbol: string) => {
      const candles = await getCandles(symbol, "1h", 200);
      const current = predict(candles, "1h");
      const prev = predict(candles.slice(0, -1), "1h");
      return { current, prev };
    },
    { interval: "1h" },
  )
);

const positionOutput = outputNode(
  async ([research]) => {
    const symbol = await getSymbol();
    const currentPrice = await getAveragePrice(symbol);
    if (research.signal === "BUY" && currentPrice > research.currentPrice) {
      return "wait";
    }
    if (research.signal === "SELL" && currentPrice < research.currentPrice) {
      return "wait";
    }
    return POSITION_LABEL_MAP[research.signal];
  },
  researchSource,
);

const confirmOutput = outputNode(
  ([sigma]) => {
    const { current: sigmaCur, prev: sigmaPrev } = sigma;
    if (!sigmaCur.reliable || !sigmaPrev.reliable) {
      return false;
    }
    if (sigmaCur.sigma <= sigmaPrev.sigma) {
      return false;
    }
    return true;
  },
  sigmaSource,
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

    const confirm = await resolve(confirmOutput);
    if (!confirm) {
      return null;
    }

    console.log("signal generated", {
      symbol,
      when,
      position,
    });

    return {
      ...Position.moonbag({
        position,
        currentPrice,
        percentStopLoss: NEVER_DRAWDOWN_PERCENT,
      }),
      minuteEstimatedTime: Infinity,
      note: `Agent research: ${research.id}`,
    };
  },
});

listenActivePing(async ({ symbol, data }) => {
  if (await not(resolve(reversalOutput))) {
    return;
  }
  await commitClosePending(symbol);
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
