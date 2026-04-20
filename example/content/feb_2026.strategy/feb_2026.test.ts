import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
  listenActivePing,
  listenIdlePing,
  getPositionHighestProfitDistancePnlCost,
  getPositionHighestMaxDrawdownPnlCost,
  Position,
  setConfig,
  getCandles,
} from "backtest-kit";
import { errorData, getErrorMessage, randomString, str } from "functools-kit";
import { predict } from "garch";
import { forecast } from "logic";

const POSITION_MINUTES = 24 * 60;
const NEVER_HARD_STOP = 50;

setConfig({
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: NEVER_HARD_STOP,
})

const POSITION_LABEL_MAP = {
  "bullish": "long",
  "bearish": "short",
  "neutral": "wait",
  "sideways": "wait",
} as const;

const forecastSource = Cache.file(
  async (symbol: string, when: Date, currentPrice: number) => {
    const result = await forecast(symbol, when);
    console.log(result, when);
    return { ...result, currentPrice };
  },
  { interval: "1d", name: "forecast_source" },
);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    const forecast = await forecastSource(symbol, when, currentPrice);
    const position = POSITION_LABEL_MAP[forecast.sentiment];
    if (position === "wait") {
      return null;
    }
    if (forecast.confidence === "not_reliable") {
      return null;
    }
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
        percentStopLoss: NEVER_HARD_STOP,
      }),
      minuteEstimatedTime: POSITION_MINUTES,
      note,
    };
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

/*
listenActivePing(async ({ symbol, data }) => {
  const candles_1m = await getCandles(symbol, "1m", 1_500);
  const candles_5m = await getCandles(symbol, "5m", 1_500);
  const candles_15m = await getCandles(symbol, "15m", 1_000);
  const candles_30m = await getCandles(symbol, "30m", 1_000);
  const candles_1h = await getCandles(symbol, "1h", 500);
  const candles_4h = await getCandles(symbol, "4h", 500);
  const candles_6h = await getCandles(symbol, "6h", 300);
  const candles_8h = await getCandles(symbol, "8h", 300);

  const { sigma: sigma_1m, reliable: reliable_1m } = await predict(candles_1m, "1m");
  const { sigma: sigma_5m, reliable: reliable_5m } = await predict(candles_5m, "5m");
  const { sigma: sigma_15m, reliable: reliable_15m } = await predict(candles_15m, "15m");
  const { sigma: sigma_30m, reliable: reliable_30m } = await predict(candles_30m, "30m");
  const { sigma: sigma_1h, reliable: reliable_1h } = await predict(candles_1h, "1h");
  const { sigma: sigma_4h, reliable: reliable_4h } = await predict(candles_4h, "4h");
  const { sigma: sigma_6h, reliable: reliable_6h } = await predict(candles_6h, "6h");
  const { sigma: sigma_8h, reliable: reliable_8h } = await predict(candles_8h, "8h");

  const volatility_1m = { sigma_1m, reliable_1m };
  const volatility_5m = { sigma_5m, reliable_5m };
  const volatility_15m = { sigma_15m, reliable_15m };
  const volatility_30m = { sigma_30m, reliable_30m };
  const volatility_1h = { sigma_1h, reliable_1h };
  const volatility_4h = { sigma_4h, reliable_4h };
  const volatility_6h = { sigma_6h, reliable_6h };
  const volatility_8h = { sigma_8h, reliable_8h };

  Log.info("position active", {
    symbol,
    volatility_1m,
    volatility_5m,
    volatility_15m,
    volatility_30m,
    volatility_1h,
    volatility_4h,
    volatility_6h,
    volatility_8h,
  });
});
*/

/*
listenIdlePing(async ({ symbol }) => {
  const candles_1m = await getCandles(symbol, "1m", 1_500);
  const candles_5m = await getCandles(symbol, "5m", 1_500);
  const candles_15m = await getCandles(symbol, "15m", 1_000);
  const candles_30m = await getCandles(symbol, "30m", 1_000);
  const candles_1h = await getCandles(symbol, "1h", 500);
  const candles_4h = await getCandles(symbol, "4h", 500);
  const candles_6h = await getCandles(symbol, "6h", 300);
  const candles_8h = await getCandles(symbol, "8h", 300);

  const { sigma: sigma_1m, reliable: reliable_1m } = await predict(candles_1m, "1m");
  const { sigma: sigma_5m, reliable: reliable_5m } = await predict(candles_5m, "5m");
  const { sigma: sigma_15m, reliable: reliable_15m } = await predict(candles_15m, "15m");
  const { sigma: sigma_30m, reliable: reliable_30m } = await predict(candles_30m, "30m");
  const { sigma: sigma_1h, reliable: reliable_1h } = await predict(candles_1h, "1h");
  const { sigma: sigma_4h, reliable: reliable_4h } = await predict(candles_4h, "4h");
  const { sigma: sigma_6h, reliable: reliable_6h } = await predict(candles_6h, "6h");
  const { sigma: sigma_8h, reliable: reliable_8h } = await predict(candles_8h, "8h");

  const volatility_1m = { sigma_1m, reliable_1m };
  const volatility_5m = { sigma_5m, reliable_5m };
  const volatility_15m = { sigma_15m, reliable_15m };
  const volatility_30m = { sigma_30m, reliable_30m };
  const volatility_1h = { sigma_1h, reliable_1h };
  const volatility_4h = { sigma_4h, reliable_4h };
  const volatility_6h = { sigma_6h, reliable_6h };
  const volatility_8h = { sigma_8h, reliable_8h };

  Log.info("position idle", {
    symbol,
    volatility_1m,
    volatility_5m,
    volatility_15m,
    volatility_30m,
    volatility_1h,
    volatility_4h,
    volatility_6h,
    volatility_8h,
  });
});
*/

listenError((error) => {
  console.log(error)
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
