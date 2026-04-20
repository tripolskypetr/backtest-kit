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
  getPositionHighestProfitDistancePnlPercentage,
  getPositionPnlPercent,
  Interval,
  getMinutesSinceLatestSignalCreated,
} from "backtest-kit";
import { errorData, getErrorMessage, randomString, str } from "functools-kit";
import { sourceNode, outputNode, resolve } from "@backtest-kit/graph";
import { forecast } from "logic";

const TRAILING_TAKE = 2.5;
const HARD_STOP = 3.0;

const NEWS_WINDOW = 24 * 60;

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
    { interval: "1d", name: "forecast_source" },
  ),
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

    const sinceEntryMinutes = await getMinutesSinceLatestSignalCreated(symbol);

    if (sinceEntryMinutes && sinceEntryMinutes < NEWS_WINDOW) {
      return null;
    }

    const forecast = await resolve(forecastSource);
    const position = await resolve(positionOutput);

    if (position === "wait") {
      return null;
    }

    if (forecast.confidence === "not_reliable") {
      return null;
    }
    if (forecast.sentiment === "neutral") {
      return null;
    }
    if (forecast.sentiment === "sideways") {
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
      "# Ссылки",
      "",
      ` - [Показать новости](/pick-dump-search/${forecast.id})`,
      "",
    );

    return {
      id: `${forecast.id}_${randomString()}`,
      ...Position.moonbag({
        position,
        currentPrice,
        percentStopLoss: HARD_STOP,
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

  if (forecast.confidence === "not_reliable") {
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
  Log.info("position closed due to the sentiment change", {
    symbol,
    data,
  });
});

listenActivePing(async ({ symbol, data }) => {
  const peakProfitDistance = await getPositionHighestProfitDistancePnlPercentage(symbol);
  const currentProfit = await getPositionPnlPercent(symbol);
  if (currentProfit < 0) {
    return;
  }
  if (peakProfitDistance < TRAILING_TAKE) {
    return;
  }
  Log.info("position closed due to the trailing take", {
    symbol,
    data,
  });
  await commitClosePending(symbol, {
    id: "unknown",
    note: str.newline(
      "# Позиция закрыта по trailing take",
    ),
  });
});

listenError((error) => {
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
