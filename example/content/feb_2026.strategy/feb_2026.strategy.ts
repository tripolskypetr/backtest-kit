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
} from "backtest-kit";
import { errorData, getErrorMessage, randomString, str } from "functools-kit";
import { sourceNode, outputNode, resolve } from "@backtest-kit/graph";
import { forecast, reaction } from "logic";

const NEVER_DRAWDOWN_PERCENT = 5;

const POSITION_LABEL_MAP = {
  "bullish": "long",
  "bearish": "short",
  "neutral": "wait",
  "sideways": "wait",
} as const;

const forecastSource = sourceNode(
  Cache.file(
    async (symbol: string, when: Date, currentPrice: number) => {
      const result = await forecast(symbol, when);
      console.log(result, when);
      return { ...result, currentPrice };
    },
    { interval: "4h", name: "forecast_source" },
  ),
);

const reactionSource = sourceNode(
  Cache.file(
    async (symbol: string, when: Date, currentPrice: number) => {
      const forecast = await resolve(forecastSource);
      const result = await reaction(forecast, symbol, when);
      console.log(result, when);
      return { ...result, currentPrice };
    },
    { interval: "4h", name: "reaction_source" }
  )
);

const positionOutput = outputNode(
  async ([forecast]) => {
    return POSITION_LABEL_MAP[forecast.sentiment];
  },
  forecastSource,
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {

    const forecast = await resolve(forecastSource);
    const position = await resolve(positionOutput);

    if (position === "wait") {
      return null;
    }
  
    const reaction = await resolve(reactionSource);

    if (forecast.sentiment === "neutral") {
      return null;
    }
    if (forecast.sentiment === "sideways") {
      return null;
    }
    if (reaction.confidence === "not_reliable") {
      return null;
    }
    if (reaction.price_reaction === "priced_in") {
      return null;
    }

    console.log("signal generated", {
      symbol,
      when,
      position,
    });

    const note = str.newline(
      "# Новостной сентимент",
      "",
      forecast.reasoning,
      "",
      "# Реакция рынка",
      "",
      reaction.reasoning,
      "",
      "# Ссылки",
      "",
      ` - [Показать новость](/pick-dump-search/${forecast.id})`,
      ` - [Показать реакцию рынка](/pick-dump-search/${forecast.id})`,
      "",
    );

    return {
      id: `${forecast.id}_${randomString()}`,
      ...Position.moonbag({
        position,
        currentPrice,
        percentStopLoss: NEVER_DRAWDOWN_PERCENT,
      }),
      minuteEstimatedTime: Infinity,
      note,
    };
  },
});

listenActivePing(async ({ symbol, data }) => {
  const forecast = await resolve(forecastSource);
  const position = await resolve(positionOutput);

  if (position === data.position) {
    return;
  }

  await commitClosePending(symbol, {
    id: forecast.id,
    note: str.newline(
      "# Новостной сентимент изменился",
      "",
      forecast.reasoning,
      "",
      "# Ссылки",
      "",
      ` - [Показать детали](/pick-dump-search/${forecast.id})`,
      "",
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
