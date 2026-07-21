import "./modules/backtest.module";

import { Exchange, type ICandleData } from "backtest-kit";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

/**
 * Sweep — подбор параметров прод-стратегии по профилям идей.
 *
 * Запуск (cwd = папка стратегии, чтобы работал persist-кеш свечей):
 *   bun Sweep.ts [SYMBOL]
 *
 * Архитектура (согласована):
 *  - Корневая итерация — ПО ИДЕЯМ, не по свечам. Поддерживаются и
 *    пересекающиеся идеи (чанки свечей шарятся между профилями),
 *    и разреженные (дыры между идеями не скачиваются вовсе).
 *  - На идею — ОДИН асинхронный проход вперёд по свечам от минуты
 *    публикации, горизонт IDEA_TRIM_DAYS. Свечи тянутся лениво
 *    чанками через Exchange.getRawCandles (persist-кеш → сеть),
 *    никакой предзагрузки месяца и никакого cut off.
 *  - Профиль идеи — посвечная траектория. Исход ЛЮБОЙ точки сетки
 *    (hard stop × trailing take × hold × minAligned) вычисляется
 *    по профилю арифметикой, свечи повторно не итерируются.
 *  - Противоходная ветка записана так же полно, как прибыльная:
 *    манипуляция китов на старте (выбить SL — потом рост) видна в
 *    профиле как MAE-до-пика и учитывается при оценке стопа.
 *  - На каждую свечу профиля считается число однонаправленных идей
 *    (уникальные авторы за ALIGNED_LOOKBACK_MINUTES) — прод входит
 *    не на первой новости, а при накоплении minAligned.
 *  - Оценка комбинации — прод-семантика "одна позиция на символ":
 *    последовательный проход по идеям, занятость слота уважается.
 *
 * Контракты честности (нарушение = мусор):
 *  - вход по open СЛЕДУЮЩЕЙ минуты после публикации + slippage;
 *  - выходы по фитилям (high/low), не по close;
 *  - трейлинг вооружается пиком ПРЕДЫДУЩИХ свечей (пик текущей свечи
 *    обновляется после проверок) и только когда фиксация >= 0;
 *  - стоп и трейлинг достижимы в одной свече -> засчитывается стоп;
 *  - slippage сидит в цене исполнения, комиссия отдельно 2 x FEE.
 */

// ---------------------------------------------------------------- константы

/** Обрезка горизонта одной идеи, дней (статическая константа). */
const IDEA_TRIM_DAYS = 5;
const IDEA_TRIM_MINUTES = IDEA_TRIM_DAYS * 24 * 60;

/** Окно счётчика однонаправленных идей, минут. */
const ALIGNED_LOOKBACK_MINUTES = 4 * 60;

/** Комиссия за ногу, % (вход + выход = x2). */
const FEE_PERCENT = 0.1;

/** Проскальзывание за ногу, % — сдвигает цену исполнения против позиции. */
const SLIPPAGE_PERCENT = 0.05;

/** Минимум сделок, чтобы комбинация могла стать лидером (анти-флюк). */
const MIN_TRADES_FOR_BEST = 8;

/**
 * Фильтр рандомных авторов — обучаемый артефакт (train = весь месяц,
 * заглядывание вперёд ВНУТРИ train допустимо и намеренно):
 * автор банится, если за месяц у него >= AUTHOR_MIN_TRACK идей
 * и доля правых < AUTHOR_MIN_HITRATE. Результат обучения — список
 * allowed/banned авторов в отчёте; проверка честности — только
 * out-of-sample (июль), не June-метрики.
 * Правота идеи = знак 5-дневного возврата в её сторону.
 */
const AUTHOR_MIN_TRACK = 3;
const AUTHOR_MIN_HITRATE = 0.5;

const MINUTE_MS = 60 * 1_000;
const CHUNK_MINUTES = 1_000;
const EXCHANGE_NAME = "ccxt-exchange";
const IDEAS_PATH = "./assets/ts-ideas.normalized.jsonl";
const reportPath = (symbol: string) => `./assets/sweep.report.${symbol}.json`;

/** Оси сетки. Окна — такие же оси перебора, как стоп и трейлинг. */
const GRID_AXES = {
  // 100 = сентинель "выход отключён": бейзлайн чистого time-exit
  hardStopPercent: [1, 1.5, 2, 2.5, 3, 4, 5, 7, 100],
  trailingTakePercent: [0.5, 1, 1.5, 2, 3, 4, 100],
  holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60, IDEA_TRIM_MINUTES],
  minAligned: [1, 2, 3],
  authorFilter: [false, true],
};

// ---------------------------------------------------------------- типы

export interface IIdea {
  id: number;
  ts: number;
  symbol: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  author: string;
}

/** Адаптер источника идей: jsonl — лишь одна из реализаций. */
export interface IdeaSource {
  getIdeas(symbol: string): Promise<IIdea[]>;
}

export class JsonlIdeaSource implements IdeaSource {
  constructor(private readonly path: string) {}
  public getIdeas = async (symbol: string): Promise<IIdea[]> => {
    const file = await readFile(this.path, "utf-8");
    return file
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as IIdea)
      .filter((idea) => idea.symbol === symbol)
      .sort((a, b) => a.ts - b.ts);
  };
}

export interface SweepPoint {
  hardStopPercent: number;
  trailingTakePercent: number;
  holdMinutes: number;
  minAligned: number;
  /** Исключать рандомных авторов из триггера и подсчёта голосов. */
  authorFilter: boolean;
}

export type SweepExitReason =
  | "hard_stop"
  | "trailing_take"
  | "time_expired"
  | "data_truncated";

export interface SweepTrade {
  ideaId: number;
  direction: "LONG" | "SHORT";
  entryTimestamp: number;
  exitTimestamp: number;
  exitReason: SweepExitReason;
  holdMinutesActual: number;
  pnlPercent: number;
}

export interface SweepPointReport {
  point: SweepPoint;
  trades: number;
  skippedBusy: number;
  totalPnlPercent: number;
  avgPnlPercent: number;
  winRate: number;
  profitFactor: number;
  maxSeriesDrawdownPercent: number;
  /**
   * Месячный Sharpe серии сделок: mean/std * sqrt(n).
   * Штрафует любой разброс — в том числе большие выигрыши.
   */
  sharpe: number;
  /**
   * Месячный Sortino: mean/downsideDev * sqrt(n), отклонение
   * считается только по убыточным сделкам — большие победители
   * не наказываются. Нет убытков -> сентинель 999.
   */
  sortino: number;
  exitReasons: Record<SweepExitReason, number>;
}

/** Профиль идеи: ссылка на посвечную траекторию + диагностика. */
interface IdeaProfile {
  idea: IIdea;
  entryTimestamp: number;
  /** open первой свечи (базовая цена входа до slippage). */
  entryPrice: number;
  /** Посвечная траектория горизонта идеи (ссылки на общие чанки). */
  candles: ICandleData[];
  /** Уникальных однонаправленных авторов на минуте входа (вкл. себя). */
  alignedAtEntry: number;
  /** То же, но только по авторам из allowed-списка. */
  alignedAtEntryFiltered: number;
  /** Автор идеи в бан-листе (обучен по всему месяцу). */
  authorRandomAtEntry: boolean;
  /** Правота идеи: 5-дневный возврат в её сторону положителен. */
  hit: boolean;
  /** Момент, когда исход идеи становится известен (конец горизонта). */
  outcomeKnownAt: number;
  /** Горизонт обрезан концом данных, а не IDEA_TRIM_DAYS. */
  truncated: boolean;
  // --- диагностика (для выбора осей и отчёта, не для оценки сетки)
  maxMfePercent: number;
  maxMaePercent: number;
  minutesToMfe: number;
  minutesToMae: number;
  /** Худшая MAE ДО свечи максимальной MFE — глубина "встряски китов". */
  shakeoutMaePercent: number;
}

// ---------------------------------------------------------------- фид свечей

/**
 * Ленивый чанковый фид: Map<chunkStart, Promise<candle[]>>.
 * Чанк скачивается один раз и шарится между пересекающимися идеями;
 * промежутки между разреженными идеями не запрашиваются вообще.
 */
class CandleFeed {
  private readonly chunks = new Map<number, Promise<ICandleData[]>>();
  public gapsFilled = 0;
  public exhaustedAt: number | null = null;

  constructor(private readonly symbol: string) {}

  private chunkStart = (ts: number): number => {
    const chunkMs = CHUNK_MINUTES * MINUTE_MS;
    return Math.floor(ts / chunkMs) * chunkMs;
  };

  private fetchChunk = (start: number): Promise<ICandleData[]> => {
    const cached = this.chunks.get(start);
    if (cached) {
      return cached;
    }
    const promise = (async () => {
      const end = start + CHUNK_MINUTES * MINUTE_MS;
      const raw = await Exchange.getRawCandles(
        this.symbol,
        "1m",
        { exchangeName: EXCHANGE_NAME },
        CHUNK_MINUTES,
        start,
        end,
      );
      const bySlot = new Map<number, ICandleData>();
      for (const candle of raw) {
        bySlot.set(candle.timestamp, candle);
      }
      // нормализация чанка: ровно CHUNK_MINUTES слотов, дыры
      // заполняются флэтом от предыдущего close и СЧИТАЮТСЯ —
      // молчаливого обрезания данных нет.
      const chunk: ICandleData[] = [];
      let prev: ICandleData | null = null;
      for (let i = 0; i < CHUNK_MINUTES; i++) {
        const ts = start + i * MINUTE_MS;
        const found = bySlot.get(ts);
        if (found) {
          chunk.push(found);
          prev = found;
        } else if (prev) {
          this.gapsFilled += 1;
          chunk.push({
            timestamp: ts,
            open: prev.close,
            high: prev.close,
            low: prev.close,
            close: prev.close,
            volume: 0,
          });
        } else {
          // дыра в начале чанка — заполним после, если есть данные
          chunk.push(null as unknown as ICandleData);
        }
      }
      // дозаполнение головы чанка первым известным open (редкий случай)
      const firstKnown = chunk.find((candle) => candle !== null);
      if (!firstKnown) {
        return [];
      }
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === null) {
          this.gapsFilled += 1;
          chunk[i] = {
            timestamp: start + i * MINUTE_MS,
            open: firstKnown.open,
            high: firstKnown.open,
            low: firstKnown.open,
            close: firstKnown.open,
            volume: 0,
          };
        }
      }
      return chunk;
    })();
    this.chunks.set(start, promise);
    return promise;
  };

  /** Асинхронная итерация вперёд от fromTs, максимум count свечей. */
  public async *iterate(
    fromTs: number,
    count: number,
  ): AsyncGenerator<ICandleData> {
    let emitted = 0;
    let cursor = this.chunkStart(fromTs);
    while (emitted < count) {
      const chunk = await this.fetchChunk(cursor);
      if (!chunk.length) {
        this.exhaustedAt = cursor;
        return;
      }
      for (const candle of chunk) {
        if (candle.timestamp < fromTs) {
          continue;
        }
        yield candle;
        emitted += 1;
        if (emitted >= count) {
          return;
        }
      }
      cursor += CHUNK_MINUTES * MINUTE_MS;
    }
  }
}

// ---------------------------------------------------------------- профили

const alignToMinute = (ts: number): number =>
  Math.floor(ts / MINUTE_MS) * MINUTE_MS;

/**
 * Уникальные однонаправленные авторы в (ts - lookback, ts] — счётчик
 * "сколько прогнозов набралось" на конкретную минуту.
 */
const countAlignedAuthors = (
  ideas: IIdea[],
  direction: "LONG" | "SHORT",
  ts: number,
  allowAuthor: (author: string, ts: number) => boolean = () => true,
): number => {
  const authors = new Set<string>();
  const from = ts - ALIGNED_LOOKBACK_MINUTES * MINUTE_MS;
  for (const idea of ideas) {
    if (idea.direction !== direction) {
      continue;
    }
    const ideaTs = alignToMinute(idea.ts) + MINUTE_MS;
    if (ideaTs > ts || ideaTs <= from) {
      continue;
    }
    if (!allowAuthor(idea.author, ts)) {
      continue;
    }
    authors.add(idea.author);
  }
  return authors.size;
};

/** Один асинхронный проход по свечам идеи → профиль с траекторией. */
const buildProfile = async (
  idea: IIdea,
  ideas: IIdea[],
  feed: CandleFeed,
): Promise<IdeaProfile | null> => {
  const entryTimestamp = alignToMinute(idea.ts) + MINUTE_MS;
  const candles: ICandleData[] = [];
  for await (const candle of feed.iterate(entryTimestamp, IDEA_TRIM_MINUTES)) {
    candles.push(candle);
  }
  if (!candles.length) {
    return null;
  }
  const direction = idea.direction === "LONG" ? 1 : -1;
  const entryPrice = candles[0].open;

  let maxMfePercent = 0;
  let maxMaePercent = 0;
  let minutesToMfe = 0;
  let minutesToMae = 0;
  let shakeoutMaePercent = 0;
  for (let i = 0; i < candles.length; i++) {
    const favorable =
      direction > 0 ? candles[i].high : candles[i].low;
    const adverse = direction > 0 ? candles[i].low : candles[i].high;
    const mfe = (direction * (favorable - entryPrice) * 100) / entryPrice;
    const mae = (direction * (adverse - entryPrice) * 100) / entryPrice;
    if (mfe > maxMfePercent) {
      maxMfePercent = mfe;
      minutesToMfe = i;
      shakeoutMaePercent = maxMaePercent;
    }
    if (mae < maxMaePercent) {
      maxMaePercent = mae;
      minutesToMae = i;
    }
  }

  const lastClose = candles[candles.length - 1].close;
  return {
    idea,
    entryTimestamp,
    entryPrice,
    candles,
    alignedAtEntry: countAlignedAuthors(
      ideas,
      idea.direction as "LONG" | "SHORT",
      entryTimestamp,
    ),
    // заполняются вторым проходом, когда известны исходы всех авторов
    alignedAtEntryFiltered: 0,
    authorRandomAtEntry: false,
    hit: direction * (lastClose - entryPrice) > 0,
    outcomeKnownAt: entryTimestamp + candles.length * MINUTE_MS,
    truncated: candles.length < IDEA_TRIM_MINUTES,
    maxMfePercent,
    maxMaePercent,
    minutesToMfe,
    minutesToMae,
    shakeoutMaePercent,
  };
};

export interface AuthorStat {
  author: string;
  ideas: number;
  hits: number;
  hitRate: number;
  banned: boolean;
}

/**
 * Обучение фильтра авторов по всему train-месяцу (lookahead внутри
 * train намеренный): hit-rate автора по всем его идеям, бан при
 * достаточной выборке и правоте хуже монетки. Возвращает статистику
 * для отчёта — allowed/banned список и есть результат обучения.
 */
const trainAuthorFilter = (
  profiles: IdeaProfile[],
  ideas: IIdea[],
): AuthorStat[] => {
  const byAuthor = new Map<string, { ideas: number; hits: number }>();
  for (const profile of profiles) {
    const stat = byAuthor.get(profile.idea.author) ?? { ideas: 0, hits: 0 };
    stat.ideas += 1;
    if (profile.hit) {
      stat.hits += 1;
    }
    byAuthor.set(profile.idea.author, stat);
  }
  const stats: AuthorStat[] = [...byAuthor].map(([author, stat]) => ({
    author,
    ideas: stat.ideas,
    hits: stat.hits,
    hitRate: stat.hits / stat.ideas,
    banned:
      stat.ideas >= AUTHOR_MIN_TRACK &&
      stat.hits / stat.ideas < AUTHOR_MIN_HITRATE,
  }));
  const banned = new Set(
    stats.filter(({ banned }) => banned).map(({ author }) => author),
  );
  for (const profile of profiles) {
    profile.authorRandomAtEntry = banned.has(profile.idea.author);
    profile.alignedAtEntryFiltered = countAlignedAuthors(
      ideas,
      profile.idea.direction as "LONG" | "SHORT",
      profile.entryTimestamp,
      (author) => !banned.has(author),
    );
  }
  return stats.sort((a, b) => b.ideas - a.ideas);
};

// ---------------------------------------------------------------- оценка

/**
 * Исход одной сделки по профилю. Обход траектории с пессимистичными
 * правилами внутри свечи (см. контракты в шапке).
 */
const simulateTrade = (
  profile: IdeaProfile,
  point: SweepPoint,
): SweepTrade => {
  const direction = profile.idea.direction === "LONG" ? 1 : -1;
  const slip = SLIPPAGE_PERCENT / 100;
  const entryFill = profile.entryPrice * (1 + direction * slip);
  const stopLevel =
    entryFill * (1 - (direction * point.hardStopPercent) / 100);
  const trailRatio = point.trailingTakePercent / 100;
  /**
   * Пик, при котором фиксация trailing take не хуже входа:
   * long: peak*(1-r) >= entry  =>  peak >= entry/(1-r)
   * short: peak*(1+r) <= entry =>  peak <= entry/(1+r)
   */
  const armLevel = entryFill / (1 - direction * trailRatio);

  let peak = entryFill;
  let exitLevel: number | null = null;
  let exitReason: SweepExitReason = "time_expired";
  let exitIndex = Math.min(point.holdMinutes, profile.candles.length) - 1;

  for (let i = 0; i <= exitIndex; i++) {
    const candle = profile.candles[i];
    const adverse = direction > 0 ? candle.low : candle.high;
    const stopHit =
      direction > 0 ? adverse <= stopLevel : adverse >= stopLevel;
    const trailLevel = peak * (1 - direction * trailRatio);
    const trailArmed =
      direction > 0 ? peak >= armLevel : peak <= armLevel;
    const trailHit =
      trailArmed &&
      (direction > 0 ? adverse <= trailLevel : adverse >= trailLevel);
    if (stopHit) {
      // стоп и трейлинг в одной свече -> пессимистично стоп
      exitLevel = stopLevel;
      exitReason = "hard_stop";
      exitIndex = i;
      break;
    }
    if (trailHit) {
      exitLevel = trailLevel;
      exitReason = "trailing_take";
      exitIndex = i;
      break;
    }
    // пик обновляется ПОСЛЕ проверок: пик текущей свечи не может
    // вооружить трейлинг в этой же свече (порядок внутри неизвестен)
    const favorable = direction > 0 ? candle.high : candle.low;
    peak = direction > 0 ? Math.max(peak, favorable) : Math.min(peak, favorable);
  }

  if (exitLevel === null) {
    exitLevel = profile.candles[exitIndex].close;
    exitReason =
      profile.truncated && exitIndex === profile.candles.length - 1
        ? "data_truncated"
        : "time_expired";
  }

  const exitFill = exitLevel * (1 - direction * slip);
  const pnlPercent =
    direction * ((exitFill - entryFill) / entryFill) * 100 - 2 * FEE_PERCENT;

  return {
    ideaId: profile.idea.id,
    direction: profile.idea.direction as "LONG" | "SHORT",
    entryTimestamp: profile.entryTimestamp,
    exitTimestamp: profile.entryTimestamp + exitIndex * MINUTE_MS,
    exitReason,
    holdMinutesActual: exitIndex + 1,
    pnlPercent,
  };
};

/**
 * Оценка точки сетки в прод-семантике: одна позиция на символ,
 * идеи при занятом слоте пропускаются, вход только при накоплении
 * minAligned однонаправленных авторов.
 */
const evaluatePoint = (
  profiles: IdeaProfile[],
  point: SweepPoint,
): { report: SweepPointReport; trades: SweepTrade[] } => {
  const trades: SweepTrade[] = [];
  const exitReasons: Record<SweepExitReason, number> = {
    hard_stop: 0,
    trailing_take: 0,
    time_expired: 0,
    data_truncated: 0,
  };
  let skippedBusy = 0;
  let busyUntil = -Infinity;

  for (const profile of profiles) {
    if (point.authorFilter && profile.authorRandomAtEntry) {
      continue;
    }
    const aligned = point.authorFilter
      ? profile.alignedAtEntryFiltered
      : profile.alignedAtEntry;
    if (aligned < point.minAligned) {
      continue;
    }
    if (profile.entryTimestamp < busyUntil) {
      skippedBusy += 1;
      continue;
    }
    const trade = simulateTrade(profile, point);
    trades.push(trade);
    exitReasons[trade.exitReason] += 1;
    busyUntil = trade.exitTimestamp + MINUTE_MS;
  }

  let totalPnlPercent = 0;
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let equity = 0;
  let equityPeak = 0;
  let maxSeriesDrawdownPercent = 0;
  for (const trade of trades) {
    totalPnlPercent += trade.pnlPercent;
    if (trade.pnlPercent > 0) {
      wins += 1;
      grossProfit += trade.pnlPercent;
    } else {
      grossLoss += -trade.pnlPercent;
    }
    equity += trade.pnlPercent;
    equityPeak = Math.max(equityPeak, equity);
    maxSeriesDrawdownPercent = Math.max(
      maxSeriesDrawdownPercent,
      equityPeak - equity,
    );
  }
  const mean = trades.length ? totalPnlPercent / trades.length : 0;
  const variance = trades.length
    ? trades.reduce(
        (acc, { pnlPercent }) => acc + (pnlPercent - mean) ** 2,
        0,
      ) / trades.length
    : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(trades.length) : 0;
  const downsideVariance = trades.length
    ? trades.reduce(
        (acc, { pnlPercent }) => acc + Math.min(pnlPercent, 0) ** 2,
        0,
      ) / trades.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance);
  const sortino =
    downsideDev > 0
      ? (mean / downsideDev) * Math.sqrt(trades.length)
      : mean > 0
        ? 999
        : 0;

  return {
    report: {
      point,
      trades: trades.length,
      skippedBusy,
      totalPnlPercent,
      avgPnlPercent: trades.length ? totalPnlPercent / trades.length : 0,
      winRate: trades.length ? wins / trades.length : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : Infinity,
      maxSeriesDrawdownPercent,
      sharpe,
      sortino,
      exitReasons,
    },
    trades,
  };
};

// ---------------------------------------------------------------- санити

/** Инварианты исходов — ловят ошибки арифметики до анализа сетки. */
const assertTradeInvariants = (trades: SweepTrade[], point: SweepPoint) => {
  const worstAllowed =
    -point.hardStopPercent -
    2 * FEE_PERCENT -
    4 * SLIPPAGE_PERCENT -
    0.01;
  for (const trade of trades) {
    if (trade.pnlPercent < worstAllowed) {
      throw new Error(
        `invariant: pnl ${trade.pnlPercent.toFixed(3)} ниже пола ` +
          `${worstAllowed.toFixed(3)} (idea ${trade.ideaId}, ${JSON.stringify(point)})`,
      );
    }
    if (
      trade.exitReason === "trailing_take" &&
      trade.pnlPercent < -2 * FEE_PERCENT - 4 * SLIPPAGE_PERCENT - 0.01
    ) {
      throw new Error(
        `invariant: trailing take зафиксировал убыток ${trade.pnlPercent.toFixed(3)} ` +
          `(idea ${trade.ideaId}, ${JSON.stringify(point)})`,
      );
    }
    if (trade.exitTimestamp < trade.entryTimestamp) {
      throw new Error(`invariant: выход раньше входа (idea ${trade.ideaId})`);
    }
  }
};

const percentile = (sorted: number[], p: number): number =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
    : NaN;

// ---------------------------------------------------------------- main

const main = async () => {
  const symbol = process.argv[2] || "BTCUSDT";
  const startedAt = Date.now();

  const source: IdeaSource = new JsonlIdeaSource(IDEAS_PATH);
  const allIdeas = await source.getIdeas(symbol);
  const ideas = allIdeas.filter((idea) => idea.direction !== "NEUTRAL");
  console.log(
    `[sweep] ${symbol}: идей ${allIdeas.length}, направленных ${ideas.length}`,
  );

  const feed = new CandleFeed(symbol);
  const profiles: IdeaProfile[] = [];
  for (const idea of ideas) {
    const profile = await buildProfile(idea, ideas, feed);
    if (profile) {
      profiles.push(profile);
    }
  }
  console.log(
    `[sweep] профилей ${profiles.length}, дыр в свечах заполнено ${feed.gapsFilled}` +
      (feed.exhaustedAt
        ? `, данные закончились на ${new Date(feed.exhaustedAt).toISOString()}`
        : ""),
  );
  const truncatedCount = profiles.filter(({ truncated }) => truncated).length;
  if (truncatedCount) {
    console.log(
      `[sweep] ВНИМАНИЕ: у ${truncatedCount} профилей горизонт обрезан концом данных`,
    );
  }

  const authorStats = trainAuthorFilter(profiles, ideas);
  const bannedStats = authorStats.filter(({ banned }) => banned);
  const bannedIdeas = profiles.filter(
    ({ authorRandomAtEntry }) => authorRandomAtEntry,
  ).length;
  console.log(
    `[sweep] фильтр авторов: забанено ${bannedStats.length}/${authorStats.length} авторов ` +
      `(${bannedIdeas}/${profiles.length} идей)`,
  );

  // диагностика распределений — по ней видно осмысленность осей сетки
  const mfes = profiles.map(({ maxMfePercent }) => maxMfePercent).sort((a, b) => a - b);
  const maes = profiles.map(({ maxMaePercent }) => maxMaePercent).sort((a, b) => a - b);
  const shakeouts = profiles
    .map(({ shakeoutMaePercent }) => shakeoutMaePercent)
    .sort((a, b) => a - b);
  console.log(
    `[sweep] MFE p25/p50/p75/p90: ` +
      [25, 50, 75, 90].map((p) => percentile(mfes, p).toFixed(2)).join(" / "),
  );
  console.log(
    `[sweep] MAE p10/p25/p50/p75: ` +
      [10, 25, 50, 75].map((p) => percentile(maes, p).toFixed(2)).join(" / "),
  );
  console.log(
    `[sweep] shakeout (MAE до пика) p10/p25/p50/p75: ` +
      [10, 25, 50, 75].map((p) => percentile(shakeouts, p).toFixed(2)).join(" / "),
  );

  // сетка
  const points: SweepPoint[] = GRID_AXES.hardStopPercent.flatMap(
    (hardStopPercent) =>
      GRID_AXES.trailingTakePercent.flatMap((trailingTakePercent) =>
        GRID_AXES.holdMinutes.flatMap((holdMinutes) =>
          GRID_AXES.minAligned.flatMap((minAligned) =>
            GRID_AXES.authorFilter.map((authorFilter) => ({
              hardStopPercent,
              trailingTakePercent,
              holdMinutes,
              minAligned,
              authorFilter,
            })),
          ),
        ),
      ),
  );
  const reports: SweepPointReport[] = [];
  const tradesByPoint = new Map<SweepPointReport, SweepTrade[]>();
  for (const point of points) {
    const { report, trades } = evaluatePoint(profiles, point);
    assertTradeInvariants(trades, point);
    reports.push(report);
    tradesByPoint.set(report, trades);
  }
  const fmt = (report: SweepPointReport) => {
    const { point } = report;
    return (
      `H=${point.hardStopPercent} TT=${point.trailingTakePercent} ` +
      `hold=${point.holdMinutes / 60}h N=${point.minAligned} ` +
      `AF=${point.authorFilter ? 1 : 0} | ` +
      `trades=${report.trades} skip=${report.skippedBusy} ` +
      `sharpe=${report.sharpe.toFixed(2)} ` +
      `sortino=${report.sortino.toFixed(2)} ` +
      `pnl=${report.totalPnlPercent.toFixed(2)}% ` +
      `avg=${report.avgPnlPercent.toFixed(3)}% ` +
      `wr=${(report.winRate * 100).toFixed(0)}% ` +
      `pf=${report.profitFactor.toFixed(2)} ` +
      `dd=${report.maxSeriesDrawdownPercent.toFixed(2)}% ` +
      `[sl=${report.exitReasons.hard_stop} tt=${report.exitReasons.trailing_take} ` +
      `exp=${report.exitReasons.time_expired} cut=${report.exitReasons.data_truncated}]`
    );
  };

  /** Итог — три рейтинга: Sharpe, Sortino, PnL. */
  const RANKINGS: {
    key: "sharpe" | "sortino" | "pnl";
    title: string;
    value: (report: SweepPointReport) => number;
  }[] = [
    { key: "sharpe", title: "Sharpe", value: ({ sharpe }) => sharpe },
    { key: "sortino", title: "Sortino", value: ({ sortino }) => sortino },
    { key: "pnl", title: "PnL", value: ({ totalPnlPercent }) => totalPnlPercent },
  ];

  const eligible = reports.filter(
    ({ trades }) => trades >= MIN_TRADES_FOR_BEST,
  );
  const bestByKey: Record<string, SweepPointReport | null> = {};
  for (const ranking of RANKINGS) {
    const sorted = [...reports].sort(
      (a, b) => ranking.value(b) - ranking.value(a),
    );
    console.log(`\n[sweep] топ-10 по ${ranking.title}:`);
    for (const report of sorted.slice(0, 10)) {
      console.log("  " + fmt(report));
    }
    const best =
      [...eligible].sort((a, b) => ranking.value(b) - ranking.value(a))[0] ??
      sorted[0] ??
      null;
    bestByKey[ranking.key] = best;
    console.log(
      `[sweep] лучший по ${ranking.title} (>=${MIN_TRADES_FOR_BEST} сделок):`,
    );
    console.log("  " + (best ? fmt(best) : "нет"));
  }
  // общий порядок в отчёте — по Sharpe (полные три сортировки строятся из reports)
  reports.sort((a, b) => b.sharpe - a.sharpe);

  for (const ranking of RANKINGS) {
    const leader = bestByKey[ranking.key];
    if (!leader) {
      continue;
    }
    console.log(`\n[sweep] сделки лидера по ${ranking.title}:`);
    for (const trade of tradesByPoint.get(leader) ?? []) {
      console.log(
        `  ${new Date(trade.entryTimestamp).toISOString().slice(0, 16)} ` +
          `${trade.direction.padEnd(5)} ${trade.exitReason.padEnd(13)} ` +
          `${trade.pnlPercent.toFixed(3).padStart(7)}% ` +
          `hold=${(trade.holdMinutesActual / 60).toFixed(1)}h idea=${trade.ideaId}`,
      );
    }
  }

  await mkdir(join(".", "assets"), { recursive: true });
  await writeFile(
    reportPath(symbol),
    JSON.stringify(
      {
        symbol,
        generatedAt: new Date(startedAt).toISOString(),
        constants: {
          IDEA_TRIM_DAYS,
          ALIGNED_LOOKBACK_MINUTES,
          FEE_PERCENT,
          SLIPPAGE_PERCENT,
        },
        profileCount: profiles.length,
        gapsFilled: feed.gapsFilled,
        truncatedCount,
        // результат обучения фильтра авторов: применять в проде/OOS
        allowedAuthors: authorStats
          .filter(({ banned }) => !banned)
          .map(({ author }) => author),
        bannedAuthors: bannedStats.map(({ author }) => author),
        authorStats,
        // три итоговых рейтинга: победитель каждого + его сделки
        best: Object.fromEntries(
          RANKINGS.map(({ key }) => {
            const leader = bestByKey[key] ?? null;
            return [
              key,
              leader
                ? { ...leader, trades_list: tradesByPoint.get(leader) ?? [] }
                : null,
            ];
          }),
        ),
        reports,
      },
      null,
      2,
    ),
    "utf-8",
  );
  console.log(
    `\n[sweep] отчёт: ${reportPath(symbol)}, ${(Date.now() - startedAt) / 1000}s`,
  );
  process.exit(0);
};

main().catch((error) => {
  console.error("[sweep] FATAL", error);
  process.exit(1);
});
