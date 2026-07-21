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
 * (посвечные траектории, выходы по фитилям, издержки в цене),
 * критерий выбора — Sharpe серии сделок, не голый PnL:
 * см. assets/sweep.report.BTCUSDT.json.
 *
 * Точка: Sharpe 3.66, +22.0% за июнь, 14 сделок, 0 стопов, dd 0.30%
 * (train-метрики: фильтр авторов обучен на этом же июне).
 *  - Фильтр авторов: бан-лист из отчёта Sweep (13/167 авторов,
 *    но 90/343 идей) — авторы с >= 3 идеями и правотой хуже монетки
 *    не считаются ни триггером, ни голосом. Обученный артефакт.
 *  - HARD_STOP 7%: чистая страховка — отфильтрованные сделки не
 *    ныряли даже до -4% (H=4..∞ на них неразличимы).
 *  - TRAILING_TAKE 1.5%: с чистыми входами узкий трейлинг перестал
 *    ловить шум — оптимум сместился с 3-4% вниз.
 *  - Холд 5 суток: контрольный прогон с горизонтом 10 дней показал
 *    плато на 120ч — оптимум не упирается в границу поиска.
 *  - Вход: скользящее окно 4ч, минимум 2 уникальных
 *    однонаправленных НЕзабаненных автора.
 *
 * Честная оговорка по бейзлайну: чистый time-exit без стопа и
 * трейлинга даёт +19.2% — выходы добавляют единицы п.п. Эдж в самих
 * входах (и в июньском дрейфе BTC); выходы — управление риском.
 *
 * ОГРАНИЧЕНИЕ (из кросс-проверки Sweep по 4 символам): эдж
 * подтверждён только на BTCUSDT. На ETHUSDT июньская толпа
 * стабильно ошибалась — стратегию на другие символы НЕ переносить
 * без отдельного Sweep. Параметры in-sample (июнь); out-of-sample
 * проверка на июльских идеях не проводилась.
 */
const ALIGNED_LOOKBACK_MINUTES = 4 * 60;
const MIN_ALIGNED_AUTHORS = 2;

const HOLD_MINUTES = 5 * 24 * 60;
const HARD_STOP = 7.0;
const TRAILING_TAKE = 1.5;

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
