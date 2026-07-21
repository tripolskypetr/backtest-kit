import { Exchange } from "../classes/Exchange";
import { ICandleData } from "../interfaces/Exchange.interface";
import {
  ISimulatorAuthorStat,
  ISimulatorBest,
  ISimulatorIdea,
  ISimulatorIdeaProfile,
  ISimulator,
  ISimulatorGridAxes,
  ISimulatorGridPoint,
  ISimulatorParams,
  ISimulatorPointReport,
  ISimulatorResult,
  ISimulatorTrade,
  SimulatorExitReason,
  SimulatorRankingCriterion,
} from "../interfaces/Simulator.interface";

import { intervalStart } from "../utils/intervalStart";

import { GLOBAL_CONFIG } from "../config/params";

const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Horizon trim per idea, days. Every idea gets its own forward
 * horizon regardless of frame boundaries — no cutoff artifacts.
 */
const IDEA_TRIM_DAYS = 5;
const IDEA_TRIM_MINUTES = IDEA_TRIM_DAYS * 24 * 60;

/**
 * Rolling window for counting aligned (same-direction) authors, minutes.
 */
const ALIGNED_LOOKBACK_MINUTES = 4 * 60;

/**
 * Author ban thresholds (trained artifact, train = whole range).
 * Ban is the DEFAULT: an author is allowed only when his correctness
 * is unambiguously proven — at least AUTHOR_MIN_TRACK ideas with a
 * known outcome and a hit rate of AUTHOR_MIN_HITRATE or better.
 * Not enough evidence (few ideas, truncated horizons) -> banned.
 */
const AUTHOR_MIN_TRACK = 3;
const AUTHOR_MIN_HITRATE = 0.5;

/**
 * Sortino sentinel for a series with profit and zero losing trades.
 */
const SORTINO_NO_LOSSES = 999;

/**
 * Minimum trades for a grid point to become a ranking winner
 * (anti-fluke guard: a two-trade point must not lead a ranking).
 */
const MIN_TRADES_FOR_BEST = 8;

async function* ITERATE_CANDLES_FN(
  self: ClientSimulator,
  symbol: string,
  fromTs: number,
  count: number,
): AsyncGenerator<ICandleData> {
    let emitted = 0;
    let cursor = intervalStart(fromTs, "1m");
    while (emitted < count) {
      const chunk = await Exchange.getRawCandles(
        symbol,
        "1m",
        { exchangeName: self.params.exchangeName },
        GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST,
        cursor,
        cursor + GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST * MINUTE_MS,
      );
      if (!chunk.length) {
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
      cursor += GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST * MINUTE_MS;
    }
}

/**
 * Counts unique same-direction authors within the rolling lookback
 * window (ts - ALIGNED_LOOKBACK_MINUTES, ts]. Ideas are anchored to
 * the minute FOLLOWING their publication (no lookahead).
 *
 * @param ideas - All ideas of the symbol
 * @param direction - Direction to count votes for
 * @param ts - Minute timestamp to count at
 * @param allowAuthor - Optional predicate to exclude authors (ban list)
 * @returns Number of unique aligned authors
 */
const COUNT_ALIGNED_AUTHORS_FN = (
  ideas: ISimulatorIdea[],
  direction: "LONG" | "SHORT",
  ts: number,
  allowAuthor: (author: string) => boolean = () => true,
): number => {
  const authors = new Set<string>();
  const from = ts - ALIGNED_LOOKBACK_MINUTES * MINUTE_MS;
  for (const idea of ideas) {
    if (idea.direction !== direction) {
      continue;
    }
    const ideaTs = intervalStart(idea.ts, "1m") + MINUTE_MS;
    if (ideaTs > ts || ideaTs <= from) {
      continue;
    }
    if (!allowAuthor(idea.author)) {
      continue;
    }
    authors.add(idea.author);
  }
  return authors.size;
};

/**
 * Builds the per-candle trajectory profile of a single idea in ONE
 * asynchronous candle pass: entry basis, MFE/MAE extremes, whale
 * shakeout depth (worst MAE before the max-MFE candle) and the
 * aligned-authors count at entry. Outcomes of ANY grid point are
 * later derived from the profile arithmetically — candles are never
 * re-iterated per grid point.
 *
 * Ban-list dependent fields (alignedAtEntryFiltered, authorBanned)
 * are filled by TRAIN_AUTHOR_FILTER_FN afterwards.
 *
 * @param self - ClientSimulator instance reference
 * @param symbol - Trading pair symbol
 * @param idea - Idea to profile
 * @param ideas - All ideas of the symbol (for aligned counting)
 * @returns Profile or null when no candles exist for the horizon
 */
const BUILD_PROFILE_FN = async (
  self: ClientSimulator,
  symbol: string,
  idea: ISimulatorIdea,
  ideas: ISimulatorIdea[],
): Promise<ISimulatorIdeaProfile | null> => {
  const entryTimestamp = intervalStart(idea.ts, "1m") + MINUTE_MS;
  const candles: ICandleData[] = [];
  for await (const candle of ITERATE_CANDLES_FN(
    self,
    symbol,
    entryTimestamp,
    IDEA_TRIM_MINUTES,
  )) {
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
    const favorable = direction > 0 ? candles[i].high : candles[i].low;
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
    alignedAtEntry: COUNT_ALIGNED_AUTHORS_FN(
      ideas,
      idea.direction as "LONG" | "SHORT",
      entryTimestamp,
    ),
    alignedAtEntryFiltered: 0,
    authorBanned: false,
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

/**
 * Trains the author ban list on the whole simulated range (lookahead
 * inside train is deliberate — honesty is provided by out-of-sample
 * validation, not by causality inside the train range) and fills the
 * ban-dependent profile fields.
 *
 * Ban is the default: when the author's correctness cannot be proven
 * unambiguously, he is banned. Only ideas with a fully observed
 * horizon count as evidence — truncated profiles prove nothing.
 *
 * @param profiles - Profiles of all directional ideas
 * @param ideas - All ideas of the symbol
 * @returns Per-author stats sorted by idea count (the trained artifact)
 */
const TRAIN_AUTHOR_FILTER_FN = (
  profiles: ISimulatorIdeaProfile[],
  ideas: ISimulatorIdea[],
): ISimulatorAuthorStat[] => {
  const byAuthor = new Map<string, { ideas: number; hits: number }>();
  for (const profile of profiles) {
    const stat = byAuthor.get(profile.idea.author) ?? { ideas: 0, hits: 0 };
    if (!profile.truncated) {
      stat.ideas += 1;
      if (profile.hit) {
        stat.hits += 1;
      }
    }
    byAuthor.set(profile.idea.author, stat);
  }
  const stats: ISimulatorAuthorStat[] = [...byAuthor].map(([author, stat]) => ({
    author,
    ideas: stat.ideas,
    hits: stat.hits,
    hitRate: stat.ideas ? stat.hits / stat.ideas : 0,
    banned:
      stat.ideas < AUTHOR_MIN_TRACK ||
      stat.hits / stat.ideas < AUTHOR_MIN_HITRATE,
  }));
  const banned = new Set(
    stats.filter(({ banned }) => banned).map(({ author }) => author),
  );
  for (const profile of profiles) {
    profile.authorBanned = banned.has(profile.idea.author);
    profile.alignedAtEntryFiltered = COUNT_ALIGNED_AUTHORS_FN(
      ideas,
      profile.idea.direction as "LONG" | "SHORT",
      profile.entryTimestamp,
      (author) => !banned.has(author),
    );
  }
  return stats.sort((a, b) => b.ideas - a.ideas);
};

/**
 * Simulates one trade: an idea profile against a grid point.
 *
 * Honesty contracts (violating any produces garbage):
 * - entry at the open of the minute AFTER publication, slippage in
 *   the fill price against the position;
 * - exits are checked against candle wicks (high/low), never close;
 * - trailing take arms from the peak of PREVIOUS candles only (the
 *   current candle peak updates after the checks) and only when the
 *   locked level is not worse than the entry;
 * - stop and trailing reachable inside one candle -> stop wins;
 * - fees are charged separately: 2 x CC_PERCENT_FEE.
 *
 * @param profile - Idea profile (candle trajectory)
 * @param point - Grid point to evaluate
 * @returns Simulated trade with net PnL
 */
const SIMULATE_TRADE_FN = (
  profile: ISimulatorIdeaProfile,
  point: ISimulatorGridPoint,
): ISimulatorTrade => {
  const direction = profile.idea.direction === "LONG" ? 1 : -1;
  const slip = GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100;
  const entryFill = profile.entryPrice * (1 + direction * slip);
  const stopLevel =
    entryFill * (1 - (direction * point.hardStopPercent) / 100);
  const trailRatio = point.trailingTakePercent / 100;
  /**
   * Peak at which the trailing take lock is not worse than entry:
   * long: peak*(1-r) >= entry  =>  peak >= entry/(1-r)
   * short: peak*(1+r) <= entry =>  peak <= entry/(1+r)
   */
  const armLevel = entryFill / (1 - direction * trailRatio);

  let peak = entryFill;
  let exitLevel: number | null = null;
  let exitReason: SimulatorExitReason = "time_expired";
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
    const favorable = direction > 0 ? candle.high : candle.low;
    peak =
      direction > 0 ? Math.max(peak, favorable) : Math.min(peak, favorable);
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
    direction * ((exitFill - entryFill) / entryFill) * 100 -
    2 * GLOBAL_CONFIG.CC_PERCENT_FEE;

  return {
    ideaId: profile.idea.id,
    direction: profile.idea.direction,
    entryTimestamp: profile.entryTimestamp,
    exitTimestamp: profile.entryTimestamp + exitIndex * MINUTE_MS,
    exitReason,
    holdMinutesActual: exitIndex + 1,
    pnlPercent,
  };
};

/**
 * Evaluates one grid point with production slot semantics: one
 * position per symbol, ideas arriving while the slot is busy are
 * skipped, entry requires minIdeasAligned unbanned aligned authors.
 * The trained author filter is preprocessing and is always applied.
 *
 * Sharpe/Sortino are TIME-BASED: computed over daily equity
 * increments across the whole simulated range (idle days included,
 * realized PnL booked on the exit day). The bucket window is
 * identical for every grid point, so the ratios are comparable and
 * dead holding time is penalized: the same total PnL concentrated in
 * rare chunky exits yields a higher daily variance — and a lower
 * ratio — than PnL spread over frequent short trades. Capital frozen
 * in a stale position is no longer free.
 *
 * @param profiles - Profiles sorted by entry timestamp
 * @param point - Grid point to evaluate
 * @param rangeStartTs - Start of the shared daily bucket window
 * @param rangeDays - Number of daily buckets in the shared window
 * @returns Aggregated report and the trade list
 */
const EVALUATE_POINT_FN = (
  profiles: ISimulatorIdeaProfile[],
  point: ISimulatorGridPoint,
  rangeStartTs: number,
  rangeDays: number,
): { report: ISimulatorPointReport; trades: ISimulatorTrade[] } => {
  const trades: ISimulatorTrade[] = [];
  const exitReasons: Record<SimulatorExitReason, number> = {
    hard_stop: 0,
    trailing_take: 0,
    time_expired: 0,
    data_truncated: 0,
  };
  let skippedBusy = 0;
  let busyUntil = -Infinity;

  for (const profile of profiles) {
    if (profile.authorBanned) {
      continue;
    }
    if (profile.alignedAtEntryFiltered < point.minIdeasAligned) {
      continue;
    }
    if (profile.entryTimestamp < busyUntil) {
      skippedBusy += 1;
      continue;
    }
    const trade = SIMULATE_TRADE_FN(profile, point);
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
  // суточная сетка приращений equity, общая для всех точек:
  // pnl сделки бронируется в день выхода, дни ожидания = 0
  const daily = new Array<number>(Math.max(rangeDays, 0)).fill(0);
  for (const trade of trades) {
    const bucket = Math.min(
      daily.length - 1,
      Math.max(0, Math.floor((trade.exitTimestamp - rangeStartTs) / DAY_MS)),
    );
    if (bucket >= 0 && bucket < daily.length) {
      daily[bucket] += trade.pnlPercent;
    }
  }
  const dayCount = daily.length;
  const meanDaily = dayCount ? totalPnlPercent / dayCount : 0;
  const varianceDaily = dayCount
    ? daily.reduce((acc, value) => acc + (value - meanDaily) ** 2, 0) /
      dayCount
    : 0;
  const stdDaily = Math.sqrt(varianceDaily);
  const sharpe =
    stdDaily > 0 ? (meanDaily / stdDaily) * Math.sqrt(dayCount) : 0;
  const downsideVarianceDaily = dayCount
    ? daily.reduce((acc, value) => acc + Math.min(value, 0) ** 2, 0) /
      dayCount
    : 0;
  const downsideDevDaily = Math.sqrt(downsideVarianceDaily);
  const sortino =
    downsideDevDaily > 0
      ? (meanDaily / downsideDevDaily) * Math.sqrt(dayCount)
      : meanDaily > 0
        ? SORTINO_NO_LOSSES
        : 0;

  // распределение времени удержания: вечный холд виден сразу по
  // хвостовым перцентилям, не по среднему
  const holds = trades
    .map(({ holdMinutesActual }) => holdMinutesActual)
    .sort((a, b) => a - b);
  const holdPercentile = (percent: number): number =>
    holds.length
      ? holds[Math.min(holds.length - 1, Math.floor((percent / 100) * holds.length))]
      : 0;
  const avgHoldMinutes = holds.length
    ? holds.reduce((acc, value) => acc + value, 0) / holds.length
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
      avgHoldMinutes,
      p95HoldMinutes: holdPercentile(95),
      p99HoldMinutes: holdPercentile(99),
      sharpe,
      sortino,
      exitReasons,
    },
    trades,
  };
};

/**
 * Builds the cartesian product of grid axes.
 *
 * @param axes - Value lists per axis
 * @returns All grid points
 */
const BUILD_GRID_FN = (axes: ISimulatorGridAxes): ISimulatorGridPoint[] =>
  axes.hardStopPercent.flatMap((hardStopPercent) =>
    axes.trailingTakePercent.flatMap((trailingTakePercent) =>
      axes.holdMinutes.flatMap((holdMinutes) =>
        axes.minIdeasAligned.map((minIdeasAligned) => ({
          hardStopPercent,
          trailingTakePercent,
          holdMinutes,
          minIdeasAligned,
        })),
      ),
    ),
  );

/**
 * Trade invariants — catch arithmetic bugs before any grid analysis.
 * Throws on violation.
 *
 * @param trades - Trades of one grid point
 * @param point - The grid point (for error context)
 */
const ASSERT_TRADE_INVARIANTS_FN = (
  trades: ISimulatorTrade[],
  point: ISimulatorGridPoint,
): void => {
  const costFloor =
    2 * GLOBAL_CONFIG.CC_PERCENT_FEE +
    4 * GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE +
    0.01;
  const worstAllowed = -point.hardStopPercent - costFloor;
  for (const trade of trades) {
    if (trade.pnlPercent < worstAllowed) {
      throw new Error(
        `ClientSimulator invariant: pnl ${trade.pnlPercent.toFixed(3)} below floor ` +
          `${worstAllowed.toFixed(3)} (idea ${trade.ideaId}, ${JSON.stringify(point)})`,
      );
    }
    if (
      trade.exitReason === "trailing_take" &&
      trade.pnlPercent < -costFloor
    ) {
      throw new Error(
        `ClientSimulator invariant: trailing take locked a loss ${trade.pnlPercent.toFixed(3)} ` +
          `(idea ${trade.ideaId}, ${JSON.stringify(point)})`,
      );
    }
    if (trade.exitTimestamp < trade.entryTimestamp) {
      throw new Error(
        `ClientSimulator invariant: exit before entry (idea ${trade.ideaId})`,
      );
    }
  }
};

/**
 * Full simulation run for a symbol: ideas -> profiles -> author
 * filter training -> grid evaluation -> three rankings.
 *
 * Every progress point the reference Sweep script printed to console
 * is emitted through ISimulatorCallbacks instead.
 *
 * @param self - ClientSimulator instance reference
 * @param symbol - Trading pair symbol
 * @param allIdeas - Ideas to simulate (other symbols are filtered out)
 * @returns Final result with reports, rankings and the author artifact
 */
const RUN_FN = async (
  self: ClientSimulator,
  symbol: string,
  allIdeas: ISimulatorIdea[],
): Promise<ISimulatorResult> => {
  const ideas = allIdeas
    .filter((idea) => idea.symbol === symbol)
    .sort((a, b) => a.ts - b.ts);
  const directional = ideas.filter(
    ({ direction }) => direction !== "NEUTRAL",
  );
  if (self.params.callbacks.onIdeas) {
    self.params.callbacks.onIdeas(symbol, ideas.length, directional.length);
  }

  const profiles: ISimulatorIdeaProfile[] = [];
  for (const idea of directional) {
    const profile = await BUILD_PROFILE_FN(self, symbol, idea, directional);
    if (profile) {
      profiles.push(profile);
    }
  }
  const truncatedCount = profiles.filter(({ truncated }) => truncated).length;
  if (self.params.callbacks.onProfiles) {
    self.params.callbacks.onProfiles(symbol, profiles, truncatedCount);
  }

  const authorStats = TRAIN_AUTHOR_FILTER_FN(profiles, directional);
  const bannedIdeas = profiles.filter(
    ({ authorBanned }) => authorBanned,
  ).length;
  if (self.params.callbacks.onAuthorsTrained) {
    self.params.callbacks.onAuthorsTrained(symbol, authorStats, bannedIdeas);
  }

  // общее окно суточных корзин для time-based Sharpe/Sortino:
  // от первого входа до последнего известного исхода, одинаково
  // для всех точек сетки — метрики сравнимы между точками
  const rangeStartTs = profiles.length
    ? Math.min(...profiles.map(({ entryTimestamp }) => entryTimestamp))
    : 0;
  const rangeEndTs = profiles.length
    ? Math.max(...profiles.map(({ outcomeKnownAt }) => outcomeKnownAt))
    : 0;
  const rangeDays = Math.max(1, Math.ceil((rangeEndTs - rangeStartTs) / DAY_MS));

  const points = BUILD_GRID_FN(self.params.gridAxes);
  const reports: ISimulatorPointReport[] = [];
  const tradesByReport = new Map<ISimulatorPointReport, ISimulatorTrade[]>();
  for (const point of points) {
    const { report, trades } = EVALUATE_POINT_FN(
      profiles,
      point,
      rangeStartTs,
      rangeDays,
    );
    ASSERT_TRADE_INVARIANTS_FN(trades, point);
    reports.push(report);
    tradesByReport.set(report, trades);
    if (self.params.callbacks.onGridPoint) {
      self.params.callbacks.onGridPoint(symbol, report, trades);
    }
  }

  const rankings: {
    criterion: SimulatorRankingCriterion;
    value: (report: ISimulatorPointReport) => number;
  }[] = [
    { criterion: "sharpe", value: ({ sharpe }) => sharpe },
    { criterion: "sortino", value: ({ sortino }) => sortino },
    { criterion: "pnl", value: ({ totalPnlPercent }) => totalPnlPercent },
  ];
  const eligible = reports.filter(
    ({ trades }) => trades >= MIN_TRADES_FOR_BEST,
  );
  const best: ISimulatorBest[] = [];
  for (const ranking of rankings) {
    const sorted = [...reports].sort(
      (a, b) => ranking.value(b) - ranking.value(a),
    );
    const winner =
      [...eligible].sort((a, b) => ranking.value(b) - ranking.value(a))[0] ??
      sorted[0] ??
      null;
    const bestEntry: ISimulatorBest = {
      criterion: ranking.criterion,
      report: winner,
      trades: winner ? (tradesByReport.get(winner) ?? []) : [],
    };
    best.push(bestEntry);
    if (self.params.callbacks.onRanking) {
      self.params.callbacks.onRanking(
        symbol,
        ranking.criterion,
        sorted,
        bestEntry,
      );
    }
  }
  reports.sort((a, b) => b.sharpe - a.sharpe);

  const result: ISimulatorResult = {
    symbol,
    ideasTotal: ideas.length,
    ideasDirectional: directional.length,
    profileCount: profiles.length,
    truncatedCount,
    authorStats,
    bannedAuthors: authorStats
      .filter(({ banned }) => banned)
      .map(({ author }) => author),
    reports,
    best,
  };
  if (self.params.callbacks.onDone) {
    self.params.callbacks.onDone(symbol, result);
  }
  return result;
};

/**
 * Parameter sweep engine over crowd trading ideas (the "Simulator").
 *
 * Finds production strategy parameters (hard stop, trailing take,
 * hold duration, entry consensus threshold) by simulating every idea
 * against every point of the grid — WITHOUT re-running a backtest per
 * point. The root iteration is over IDEAS, not candles and not grid
 * points:
 *
 * 1. Each idea gets ONE asynchronous forward candle pass from the
 *    minute after its publication, capped by a static horizon
 *    (IDEA_TRIM_DAYS). The pass produces a per-candle trajectory
 *    profile (MFE/MAE extremes, whale shakeout depth, aligned-authors
 *    count). Overlapping and sparse ideas are both supported: candle
 *    chunks are fetched lazily through the Exchange (persist cache
 *    first), gaps between ideas are never requested.
 * 2. The author ban list is TRAINED on the whole range (lookahead
 *    inside train is deliberate): authors with enough ideas and a hit
 *    rate worse than a coin are excluded from triggers and votes.
 *    The list is part of the result — apply it in production as-is.
 * 3. The outcome of every grid point is derived arithmetically from
 *    the profiles with production slot semantics (one position per
 *    symbol, busy-slot ideas skipped). Honesty contracts: entry at
 *    next-minute open, exits by candle wicks (never close-to-close),
 *    stop wins inside an ambiguous candle, trailing arms only from
 *    previous-candle peaks, fees and slippage from GLOBAL_CONFIG on
 *    both legs.
 * 4. Grid winners are picked by three rankings (Sharpe, Sortino,
 *    total PnL) with an anti-fluke minimum-trades guard.
 *
 * Every stage emits an ISimulatorCallbacks hook; the client itself
 * is stateless between runs — each run() call is independent.
 *
 * Validation of the chosen parameters MUST be done by a real engine
 * backtest (Backtest.run): the simulator picks candidates, it does
 * not replace the engine.
 */
export class ClientSimulator implements ISimulator {
  constructor (readonly params: ISimulatorParams) { }

  /**
   * Runs the full simulation pipeline for a symbol.
   *
   * Steps and emitted callbacks:
   * 1. Filters the input array by symbol, sorts by publication time,
   *    drops NEUTRAL ideas -> onIdeas(symbol, total, directional).
   * 2. Builds one trajectory profile per idea (lazy candle fetch
   *    through the Exchange schema; ideas with no candle data are
   *    dropped) -> onProfiles(symbol, profiles, truncatedCount).
   * 3. Trains the author ban list on the whole range
   *    -> onAuthorsTrained(symbol, stats, bannedIdeas).
   * 4. Evaluates the cartesian grid of params.gridAxes over the
   *    profiles, checking trade invariants on every point
   *    -> onGridPoint(symbol, report, trades) per point.
   * 5. Ranks all points by Sharpe, Sortino and total PnL
   *    -> onRanking(symbol, criterion, sorted, best) per criterion.
   * 6. Assembles the final result -> onDone(symbol, result).
   *
   * The ideas array may contain multiple symbols — foreign ones are
   * filtered out before any computation, so one shared feed can be
   * passed for every symbol.
   *
   * @param symbol - Trading pair symbol to simulate (e.g., "BTCUSDT")
   * @param ideas - Ideas feed (other symbols are filtered out)
   * @returns Final result: all grid point reports (sorted by Sharpe),
   * winners of the three rankings with their trade lists, and the
   * trained author filter artifact (stats + ban list)
   * @throws Error when a grid point produces a trade violating the
   * arithmetic invariants (PnL below the hard stop floor, trailing
   * take locking a loss, exit before entry)
   */
  public run = async (
    symbol: string,
    ideas: ISimulatorIdea[],
  ): Promise<ISimulatorResult> => {
    this.params.logger.debug("ClientSimulator run", {
      symbol,
      ideasLen: ideas.length,
    });
    return await RUN_FN(this, symbol, ideas);
  }
}