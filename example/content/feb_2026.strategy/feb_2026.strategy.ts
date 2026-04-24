import {
  addStrategySchema,
  listenError,
  Cache,
  Log,
  Position,
  listenActivePing,
  commitClosePending,
  getPositionHighestProfitDistancePnlPercentage,
  getPositionHighestPnlPercentage,
  getPositionPnlPercent,
  getMinutesSinceLatestSignalCreated,
} from "backtest-kit";
import { errorData, getErrorMessage, randomString, str } from "functools-kit";
import { sourceNode, outputNode, resolve } from "@backtest-kit/graph";
import { run, File, extract } from "@backtest-kit/pinets";
import { forecast } from "logic";

// если рынок за 240 минут до входа шёл сильно против позиции — сигнал ещё не переварен в цену
const ROC240_MOVE_THRESHOLD = 1.5;
// не активировать trailing пока позиция не набрала достаточно прибыли
const TRAILING_TAKE_ACTIVATION = 1.5;
// минимальный trailing — не выскакивать раньше чем на 0.75% от пика
const TRAILING_TAKE_MIN = 0.75;
// масштабирование: чем больше накоплено, тем шире даём качаться
const TRAILING_TAKE_SCALE = 0.15;
// статистически недостижимый стоп — страховка от чёрного лебедя
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

const moveSource = sourceNode(
  async (symbol) => {
    const plots = await run(File.fromPath("roc240.pine", "./math"), {
      symbol,
      timeframe: "1m",
      limit: 241,
    });

    const { value } = await extract(plots, {
      value: "Value",
    });

    return value;
  }
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

    const roc240 = await resolve(moveSource);

    // рынок активно шёл против позиции — новостной сентимент ещё не переварен в цену
    if (position === "short" && roc240 > ROC240_MOVE_THRESHOLD) {
      return null;
    }
    if (position === "long" && roc240 < -ROC240_MOVE_THRESHOLD) {
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
  const peakProfit = await getPositionHighestPnlPercentage(symbol);
  const currentProfit = await getPositionPnlPercent(symbol);

  if (currentProfit < 0) {
    return;
  }

  if ((peakProfit ?? 0) < TRAILING_TAKE_ACTIVATION) {
    return;
  }

  // trailing растёт вместе с накопленной прибылью: на +16% peak даёт 2.4%, на +3% — 0.75%
  const trailingThreshold = Math.max(TRAILING_TAKE_MIN, (peakProfit ?? 0) * TRAILING_TAKE_SCALE);

  if (peakProfitDistance < trailingThreshold) {
    return;
  }

  Log.info("position closed due to the trailing take", {
    symbol,
    data,
    peakProfit,
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
