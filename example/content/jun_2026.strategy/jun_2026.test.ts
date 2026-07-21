import {
  addStrategySchema,
  listenError,
  listenActivePing,
  listenSignal,
  alignToInterval,
  Log,
  Position,
  getPositionActiveMinutes,
  getPositionHighestPnlPercentage,
  getPositionMaxDrawdownPnlPercentage,
  getPositionHighestProfitDistancePnlPercentage,
  getPositionHighestProfitMinutes,
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
 * Замерочная (dummy) версия стратегии: идеи TradingView группируются
 * в 4-часовые окна — так видно число авторов, которые придерживались
 * одной и той же идеи. Смысл не в следовании рекомендации, а в замере
 * ликвидности толпы, которая входит по постам авторов.
 *
 * Вход на закрытии окна (без заглядывания в будущее) в сторону
 * большинства уникальных авторов. При равенстве голосов — пропуск.
 *
 * Стоп фактически отключён, выход только по истечению окна наблюдения.
 * По логу "crowd measure" потом определяется:
 *  - читают ли авторов вообще (peakPnlPercent > шума при росте консенсуса);
 *  - оптимальный Trailing Take (распределение peakDistancePercent у прибыльных);
 *  - оптимальный Hard Stop (распределение maxDrawdownPercent у прибыльных vs убыточных);
 *  - peak staleness (maxPeakStalenessMinutes, minutesToPeak) для выхода по застою пика.
 */
const CONSENSUS_INTERVAL = "4h";
const CONSENSUS_INTERVAL_MS = 4 * 60 * 60 * 1_000;

const OBSERVATION_MINUTES = 24 * 60;
const NEVER_HARD_STOP = 50;

const getIdeas = singleshot(async () => {
  const file = await readFile("./assets/ts-ideas.normalized.jsonl", "utf-8");
  const lines = file
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return lines.reduce((acc, idea) => {
    const windowStart = alignToInterval(
      new Date(idea.ts),
      CONSENSUS_INTERVAL,
    ).getTime();
    const ideas = acc.get(windowStart);
    if (ideas) {
      ideas.push(idea);
    } else {
      acc.set(windowStart, [idea]);
    }
    return acc;
  }, new Map<number, Idea[]>());
});

async function getWindowIdeas(symbol: string, when: Date): Promise<Idea[]> {
  const windowStart = when.getTime() - CONSENSUS_INTERVAL_MS;
  const windowMap = await getIdeas();
  const ideas = windowMap.get(windowStart) ?? [];
  return ideas.filter((idea) => idea.symbol === symbol);
}

interface WindowConsensus {
  windowStart: string;
  windowEnd: string;
  direction: "LONG" | "SHORT";
  longAuthorCount: number;
  shortAuthorCount: number;
  neutralAuthorCount: number;
  authors: string[];
  ideas: Pick<Idea, "id" | "author" | "direction" | "title" | "url">[];
}

async function getWindowConsensus(
  symbol: string,
  when: Date,
): Promise<WindowConsensus | null> {
  const ideas = await getWindowIdeas(symbol, when);
  if (!ideas.length) {
    return null;
  }

  const longAuthors = new Set(
    ideas
      .filter(({ direction }) => direction === "LONG")
      .map(({ author }) => author),
  );
  const shortAuthors = new Set(
    ideas
      .filter(({ direction }) => direction === "SHORT")
      .map(({ author }) => author),
  );
  const neutralAuthors = new Set(
    ideas
      .filter(({ direction }) => direction === "NEUTRAL")
      .map(({ author }) => author),
  );

  if (longAuthors.size === shortAuthors.size) {
    Log.info("window skipped (no author consensus)", {
      symbol,
      windowEnd: when.toISOString(),
      longAuthorCount: longAuthors.size,
      shortAuthorCount: shortAuthors.size,
      ideas,
    });
    return null;
  }

  const direction = longAuthors.size > shortAuthors.size ? "LONG" : "SHORT";
  const winnerAuthors = direction === "LONG" ? longAuthors : shortAuthors;

  return {
    windowStart: new Date(when.getTime() - CONSENSUS_INTERVAL_MS).toISOString(),
    windowEnd: when.toISOString(),
    direction,
    longAuthorCount: longAuthors.size,
    shortAuthorCount: shortAuthors.size,
    neutralAuthorCount: neutralAuthors.size,
    authors: [...winnerAuthors],
    ideas: ideas.map(({ id, author, direction, title, url }) => ({
      id,
      author,
      direction,
      title,
      url,
    })),
  };
}

interface MeasureTracker {
  consensus: WindowConsensus;
  peakPnlPercent: number;
  maxDrawdownPercent: number;
  peakDistancePercent: number;
  maxPeakStalenessMinutes: number;
  minutesToPeak: number;
  minutesToTrough: number;
}

const trackerMap = new Map<string, MeasureTracker>();

addStrategySchema({
  strategyName: "jun_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    const consensus = await getWindowConsensus(symbol, when);

    if (!consensus) {
      return null;
    }

    const position = consensus.direction === "LONG" ? "long" : "short";

    trackerMap.set(symbol, {
      consensus,
      peakPnlPercent: 0,
      maxDrawdownPercent: 0,
      peakDistancePercent: 0,
      maxPeakStalenessMinutes: 0,
      minutesToPeak: 0,
      minutesToTrough: 0,
    });

    Log.info("position open by window consensus", {
      symbol,
      consensus,
      currentPrice,
    });

    return {
      id: `${when.getTime()}_${randomString()}`,
      position,
      ...Position.moonbag({
        position,
        currentPrice,
        percentStopLoss: NEVER_HARD_STOP,
      }),
      minuteEstimatedTime: OBSERVATION_MINUTES,
      note: str.newline(
        `# Консенсус ${consensus.direction} за окно ${CONSENSUS_INTERVAL}`,
        "",
        `LONG авторов: ${consensus.longAuthorCount}, SHORT авторов: ${consensus.shortAuthorCount}, NEUTRAL авторов: ${consensus.neutralAuthorCount}`,
        "",
        ...consensus.ideas.map(
          ({ author, direction, title, url }) =>
            ` - [${direction} @${author}: ${title}](${url})`,
        ),
      ),
    };
  },
});

listenActivePing(async ({ symbol, timestamp }) => {
  const tracker = trackerMap.get(symbol);
  if (!tracker) {
    return;
  }

  const peakPnlPercent = await getPositionHighestPnlPercentage(symbol);
  const maxDrawdownPercent =
    await getPositionMaxDrawdownPnlPercentage(symbol);
  const peakDistancePercent =
    await getPositionHighestProfitDistancePnlPercentage(symbol);
  const peakStalenessMinutes = await getPositionHighestProfitMinutes(symbol);

  if (peakPnlPercent > tracker.peakPnlPercent) {
    tracker.minutesToPeak = await getPositionActiveMinutes(symbol);
  }

  if (maxDrawdownPercent < tracker.maxDrawdownPercent) {
    tracker.minutesToTrough = await getPositionActiveMinutes(symbol);
  }

  tracker.peakPnlPercent = Math.max(tracker.peakPnlPercent, peakPnlPercent);
  tracker.maxDrawdownPercent = Math.min(
    tracker.maxDrawdownPercent,
    maxDrawdownPercent,
  );
  tracker.peakDistancePercent = peakDistancePercent;
  tracker.maxPeakStalenessMinutes = Math.max(
    tracker.maxPeakStalenessMinutes,
    peakStalenessMinutes,
  );

  const skippedIdeas = await getWindowIdeas(symbol, new Date(timestamp));
  if (skippedIdeas.length) {
    Log.info("window skipped (position already active)", {
      symbol,
      windowEnd: new Date(timestamp).toISOString(),
      activeWindowEnd: tracker.consensus.windowEnd,
      ideas: skippedIdeas,
    });
  }
});

listenSignal((event) => {
  if (event.action !== "closed") {
    return;
  }

  const { symbol, signal, closeReason, closeTimestamp, pnl } = event;
  const tracker = trackerMap.get(symbol);
  if (!tracker) {
    return;
  }
  trackerMap.delete(symbol);

  Log.info("crowd measure", {
    symbol,
    signalId: signal.id,
    consensus: tracker.consensus,
    closedAt: new Date(closeTimestamp).toISOString(),
    closeReason,
    finalPnl: pnl,
    peakPnlPercent: tracker.peakPnlPercent,
    maxDrawdownPercent: tracker.maxDrawdownPercent,
    peakDistanceAtClosePercent: tracker.peakDistancePercent,
    maxPeakStalenessMinutes: tracker.maxPeakStalenessMinutes,
    minutesToPeak: tracker.minutesToPeak,
    minutesToTrough: tracker.minutesToTrough,
    observationMinutes: OBSERVATION_MINUTES,
  });
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
