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
 * Боевая версия. Параметры и белый список авторов — из ядровой
 * сущности Simulator (генератор: scripts/simulator.mjs, артефакт:
 * assets/sweep.report.BTCUSDT.json). Правило бана авторов — тоже
 * ось перебора сетки; победило самое строгое из предложенных.
 *
 * Точка Sharpe-победителя: H=4 / TT=2 / hold=120ч / N=1 при правиле
 * track >= 5, hitRate >= 0.6. Симуляторное ожидание: +26.51% за
 * июнь, 12 сделок, wr 92%, time-based Sharpe 3.01, 0 стопов.
 *  - Фильтр авторов: дефолт-бан — допущены только авторы с >= 5
 *    идеями с известным исходом и правотой >= 60%. На июне это
 *    5 авторов из 167 (36 идей из 343); недоказанный = забанен.
 *  - N=1: при элитном белом списке консенсус избыточен — пост
 *    доказанного автора сам по себе сигнал (консенсус N=2 давал
 *    всего 4 триггера за месяц).
 *  - HARD_STOP 4%: страховка — у победителя сетки ни одного
 *    срабатывания за июнь.
 *  - TRAILING_TAKE 2%, холд 5 суток — точка победителя сетки.
 *
 * Честные оговорки: метрики train-on-train (правило фильтра И
 * пятёрка авторов выбраны по тому же июню — частично тавтология);
 * чем строже правило бана, тем жирнее ошибка отбора. Эдж подтверждён
 * только на BTCUSDT; out-of-sample проверка (июль) не проводилась.
 * Финальный арбитр параметров — прогон движка, не симулятор.
 */
const ALIGNED_LOOKBACK_MINUTES = 4 * 60;
const MIN_ALIGNED_AUTHORS = 1;

const HOLD_MINUTES = 5 * 24 * 60;
const HARD_STOP = 4.0;
const TRAILING_TAKE = 2.0;

const MINUTE_MS = 60 * 1_000;

/**
 * Бан-лист авторов — обученный артефакт Sweep (train = июнь):
 * авторы с >= 3 идеями и правотой хуже монетки не считаются
 * ни триггером, ни голосом консенсуса.
 */
const getBannedAuthors = singleshot(async (): Promise<Set<string>> => {
  const file = await readFile("./assets/sweep.report.BTCUSDT.json", "utf-8");
  const report = JSON.parse(file) as { bannedAuthors: string[] };
  return new Set(report.bannedAuthors);
});

const getIdeas = singleshot(async (): Promise<Idea[]> => {
  const [file, banned] = await Promise.all([
    readFile("./assets/ts-ideas.normalized.jsonl", "utf-8"),
    getBannedAuthors(),
  ]);
  return file
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Idea)
    .filter(({ author }) => !banned.has(author))
    .sort((a, b) => a.ts - b.ts);
});

const alignToMinute = (ts: number): number =>
  Math.floor(ts / MINUTE_MS) * MINUTE_MS;

/**
 * Триггер как в Sweep: идея, опубликованная на прошлой минуте,
 * входит, если в скользящем окне набралось MIN_ALIGNED_AUTHORS
 * уникальных однонаправленных НЕзабаненных авторов (включая её
 * автора).
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
