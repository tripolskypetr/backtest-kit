import {
  addStrategySchema,
  listenError,
  listenActivePing,
  listenSignal,
  Log,
  Position,
  commitClosePending,
  getPositionPnlPercent,
  getPositionHighestProfitDistancePnlPercentage,
} from "backtest-kit";
import {
  errorData,
  getErrorMessage,
  randomString,
  singleshot,
  str,
} from "functools-kit";
import { readFile } from "fs/promises";

interface Idea {
  id: number;
  ts: number;
  symbol: string;
  fullName: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  author: string;
  authorIsPro: boolean;
  isScript: boolean;
  title: string;
  url: string;
  firstSeen: number;
}

/**
 * Боевая версия. Параметры подобраны Sweep.ts по профилям идей
 * (посвечные траектории, выходы по фитилям, издержки в цене):
 * см. assets/sweep.report.BTCUSDT.json.
 *
 * Точка — центр устойчивого плато BTCUSDT (соседи +18.7…+22.6%,
 * ожидание Sweep: +20.8% за июнь при 8 сделках, 1 стоп):
 *  - HARD_STOP 5%: страховка ГЛУБЖЕ встряски китов — четверть идей
 *    ныряет до -2.7% ДО того, как пойти к пику (медиана -1.3%);
 *    узкие стопы 1-3% режут будущих победителей на старте.
 *  - TRAILING_TAKE 4%: пики толпы крупные, но отдаются; узкий
 *    трейлинг (<1%) закрывается об шум минуток всегда.
 *  - Холд 5 суток: пики зреют днями (медианный путь к MFE — часы
 *    и десятки часов, не минуты).
 *  - Вход: скользящее окно 4ч, минимум 3 уникальных
 *    однонаправленных автора — не на первой попавшейся новости.
 *
 * ОГРАНИЧЕНИЕ (из кросс-проверки Sweep по 4 символам): эдж
 * подтверждён только на BTCUSDT. На ETHUSDT июньская толпа
 * стабильно ошибалась (-12…-21% на этом же плато) — стратегию
 * на другие символы НЕ переносить без отдельного Sweep.
 */
const ALIGNED_LOOKBACK_MINUTES = 4 * 60;
const MIN_ALIGNED_AUTHORS = 3;

const HOLD_MINUTES = 5 * 24 * 60;
const HARD_STOP = 5.0;
const TRAILING_TAKE = 4.0;

const MINUTE_MS = 60 * 1_000;

const getIdeas = singleshot(async (): Promise<Idea[]> => {
  const file = await readFile("./assets/ts-ideas.normalized.jsonl", "utf-8");
  return file
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Idea)
    .sort((a, b) => a.ts - b.ts);
});

const alignToMinute = (ts: number): number =>
  Math.floor(ts / MINUTE_MS) * MINUTE_MS;

/**
 * Триггер как в Sweep: идея, опубликованная на прошлой минуте,
 * входит, если в скользящем окне набралось MIN_ALIGNED_AUTHORS
 * уникальных однонаправленных авторов (включая её автора).
 */
const getTriggerIdea = async (
  symbol: string,
  when: Date,
): Promise<{ idea: Idea; aligned: number; windowIdeas: Idea[] } | null> => {
  const ideas = await getIdeas();
  const now = when.getTime();
  const from = now - ALIGNED_LOOKBACK_MINUTES * MINUTE_MS;
  const fresh = ideas.filter((idea) => {
    if (idea.symbol !== symbol || idea.direction === "NEUTRAL") {
      return false;
    }
    return alignToMinute(idea.ts) + MINUTE_MS === now;
  });
  for (const idea of fresh) {
    const windowIdeas = ideas.filter((other) => {
      if (other.symbol !== symbol || other.direction !== idea.direction) {
        return false;
      }
      const otherTs = alignToMinute(other.ts) + MINUTE_MS;
      return otherTs > from && otherTs <= now;
    });
    const aligned = new Set(windowIdeas.map(({ author }) => author)).size;
    if (aligned >= MIN_ALIGNED_AUTHORS) {
      return { idea, aligned, windowIdeas };
    }
  }
  return null;
};

addStrategySchema({
  strategyName: "jun_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    const trigger = await getTriggerIdea(symbol, when);

    if (!trigger) {
      return null;
    }

    const { idea, aligned, windowIdeas } = trigger;
    const position = idea.direction === "LONG" ? "long" : "short";

    Log.info("position open by aligned ideas", {
      symbol,
      ideaId: idea.id,
      direction: idea.direction,
      aligned,
      currentPrice,
    });

    return {
      id: `${idea.id}_${randomString()}`,
      position,
      ...Position.moonbag({
        position,
        currentPrice,
        percentStopLoss: HARD_STOP,
      }),
      minuteEstimatedTime: HOLD_MINUTES,
      note: str.newline(
        `# ${idea.direction}: ${aligned} однонаправленных авторов за ${ALIGNED_LOOKBACK_MINUTES / 60}ч`,
        "",
        ...windowIdeas.map(
          ({ author, title, url }) => ` - [@${author}: ${title}](${url})`,
        ),
      ),
    };
  },
});

listenActivePing(async ({ symbol, data }) => {
  const currentProfit = await getPositionPnlPercent(symbol);
  if (currentProfit < 0) {
    return;
  }
  const peakDistance =
    await getPositionHighestProfitDistancePnlPercentage(symbol);
  if (peakDistance < TRAILING_TAKE) {
    return;
  }
  Log.info("position closed due to the trailing take", {
    symbol,
    signalId: data.id,
    currentProfit,
    peakDistance,
  });
  await commitClosePending(symbol, {
    id: "unknown",
    note: str.newline(
      "# Позиция закрыта по trailing take",
      "",
      `Откат ${peakDistance.toFixed(2)}% от рекордного PnL при пороге ${TRAILING_TAKE}%`,
    ),
  });
});

listenSignal((event) => {
  if (event.action !== "closed") {
    return;
  }
  const { symbol, signal, closeReason, closeTimestamp, pnl } = event;
  Log.info("position closed", {
    symbol,
    signalId: signal.id,
    closedAt: new Date(closeTimestamp).toISOString(),
    closeReason,
    pnl,
  });
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
