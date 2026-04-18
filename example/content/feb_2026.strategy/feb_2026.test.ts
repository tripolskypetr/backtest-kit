import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
  listenActivePing,
  getPositionHighestProfitDistancePnlCost,
  getPositionHighestMaxDrawdownPnlCost,
  Position,
  setConfig,
} from "backtest-kit";
import { errorData, getErrorMessage, randomString, str } from "functools-kit";
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

listenError((error) => {
  console.log()
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
