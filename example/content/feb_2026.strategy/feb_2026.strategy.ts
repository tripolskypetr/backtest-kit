import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
  Position,
  listenActivePing,
  commitClosePending,
  getPositionHighestProfitDistancePnlPercentage,
  getPositionPnlPercent,
  getMinutesSinceLatestSignalCreated,
  getCandles,
} from "backtest-kit";
import { errorData, getErrorMessage, randomString, str } from "functools-kit";
import { sourceNode, outputNode, resolve } from "@backtest-kit/graph";
import { forecast } from "logic";
import { predict } from "garch";

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

const volatilitySource = sourceNode(
  Cache.fn(async (symbol) => {
    const [candles_1h, candles_4h, candles_8h] = await Promise.all([
      getCandles(symbol, "1h", 500),
      getCandles(symbol, "4h", 500),
      getCandles(symbol, "8h", 300),
    ]);
    const [{ sigma: sigma_1h }, { sigma: sigma_4h }, { sigma: sigma_8h }] = [
      predict(candles_1h, "1h"),
      predict(candles_4h, "4h"),
      predict(candles_8h, "8h"),
    ];
    return {
      sigma_1h,
      sigma_4h,
      sigma_8h,
    }
  }, {
    interval: "1h"
  })
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

    const volatility = await resolve(volatilitySource);

    // sigma_mid на 2+ старших TF → боковик, PLAN.md запрещает вход
    const midTfCount = [
      volatility.sigma_1h <= 0.007643 && volatility.sigma_1h >= 0.004510,
      volatility.sigma_4h <= 0.014964 && volatility.sigma_4h >= 0.010715,
      volatility.sigma_8h <= 0.020720 && volatility.sigma_8h >= 0.014490,
    ].filter(Boolean).length;

    if (midTfCount >= 2) {
      return null;
    }

    // нет подтверждения тренда на 2+ старших TF → не входить
    const highTfCount = [
      volatility.sigma_1h > 0.007643,
      volatility.sigma_4h > 0.014964,
      volatility.sigma_8h > 0.020720,
    ].filter(Boolean).length;

    if (highTfCount < 2) {
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

  const { sigma_4h } = await resolve(volatilitySource);

  const trailingThreshold = sigma_4h > 0.014964 ? TRAILING_TAKE : TRAILING_TAKE / 2;

  if (peakProfitDistance < trailingThreshold) {
    return;
  }

  Log.info("position closed due to the trailing take", {
    symbol,
    data,
    sigma_4h,
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
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
