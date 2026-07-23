import { getErrorMessage } from "functools-kit";
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
  ISimulatorTestResult,
  ISimulatorTrade,
  SimulatorAuthorMetric,
  SimulatorAuthorRule,
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
 * Anti-flood window: an author may contribute at most one idea per
 * direction within this many minutes. A repeated post is a bump of
 * the same opinion, not new evidence — it must not inflate the
 * author track record or retrigger entries.
 */
const AUTHOR_DEDUPE_MINUTES = 8 * 60;

/**
 * Sortino of a profitable series with zero losing days is
 * mathematically infinite. Infinity is used deliberately — a finite
 * sentinel (e.g. 999) misleads because real Sortino values can
 * exceed it. Consistent with profitFactor: Infinity when no losses.
 * NB: JSON.stringify turns Infinity into null in saved artifacts.
 */
const SORTINO_NO_LOSSES = Number.POSITIVE_INFINITY;

/**
 * Minimum trades for a grid point to become a ranking winner
 * (anti-fluke guard: a two-trade point must not lead a ranking).
 */
const MIN_TRADES_FOR_BEST = 8;

/**
 * Fixed MFE threshold of the "pnl" author metric, percent. A hit is
 * an idea whose PnL grew by MORE than this at any moment of the
 * horizon — independent of the point's lock and stop by design, so
 * the grading survives lock-free grids where reach/retain would
 * degenerate into "close".
 */
const PNL_HIT_THRESHOLD_PERCENT = 1;

async function* ITERATE_CANDLES_FN(
  self: ClientSimulator,
  symbol: string,
  fromTs: number,
  count: number,
): AsyncGenerator<ICandleData> {
    let emitted = 0;
    let cursor = intervalStart(fromTs, "1m");
    while (emitted < count) {
      let chunk: ICandleData[];
      try {
        chunk = await Exchange.getRawCandles(
          symbol,
          "1m",
          { exchangeName: self.params.exchangeName },
          GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST,
          cursor,
          cursor + GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST * MINUTE_MS,
        );
      } catch (error) {
        // контракт Exchange строг: пропуски заблокированы, адаптер
        // обязан вернуть ровно limit свечей — поэтому конец доступной
        // истории приходит сюда ИСКЛЮЧЕНИЕМ (пустой или неполный
        // чанк). Для симулятора это штатный случай: идея у края
        // данных получает обрезанный профиль (truncated), а не валит
        // весь прогон. Обрезка идёт по границе последнего полного
        // чанка; следствие — у идей, чей ПЕРВЫЙ чанк задевает край,
        // свечей не будет вовсе (null-профиль): у края истории есть
        // теневая зона глубиной в один чанк. Реальные транзиентные
        // сбои сети гасятся ретраями Exchange до этой точки.
        self.params.logger.debug("ClientSimulator candle feed exhausted", {
          symbol,
          cursor,
          error: `${getErrorMessage(error)}`,
        });
        return;
      }
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
      // частичный чанк = конец доступной истории: следующий запрос
      // был бы полностью за краем данных, а пустой ответ адаптера —
      // ошибка контракта Exchange (пропуски заблокированы на его
      // уровне). Останавливаемся — профиль будет помечен truncated.
      if (chunk.length < GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST) {
        return;
      }
      cursor += GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST * MINUTE_MS;
    }
}

/**
 * Drops flood duplicates: for every author + direction pair only the
 * first idea of each AUTHOR_DEDUPE_MINUTES window survives. A kept
 * idea opens the window; posts inside it are discarded entirely —
 * they get no profile (no track record inflation) and no entry
 * trigger.
 *
 * @param ideas - Ideas sorted by publication time ascending
 * @returns Deduplicated ideas (order preserved)
 */
const DEDUPE_IDEAS_FN = (ideas: ISimulatorIdea[]): ISimulatorIdea[] => {
  const lastKept = new Map<string, number>();
  const result: ISimulatorIdea[] = [];
  for (const idea of ideas) {
    const key = `${idea.author}:${idea.direction}`;
    const last = lastKept.get(key);
    if (
      last !== undefined &&
      idea.ts - last < AUTHOR_DEDUPE_MINUTES * MINUTE_MS
    ) {
      continue;
    }
    lastKept.set(key, idea.ts);
    result.push(idea);
  }
  return result;
};

/**
 * Builds the per-candle trajectory profile of a single idea in ONE
 * asynchronous candle pass: entry basis, MFE/MAE extremes and whale
 * shakeout depth (worst MAE before the max-MFE candle). Outcomes of
 * ANY grid point are later derived from the profile arithmetically —
 * candles are never re-iterated per grid point.
 *
 * The ban-list dependent flag (authorBanned) is filled by
 * TRAIN_AUTHOR_FILTER_FN afterwards.
 *
 * @param self - ClientSimulator instance reference
 * @param symbol - Trading pair symbol
 * @param idea - Idea to profile
 * @returns Profile or null when no candles exist for the horizon
 */
const BUILD_PROFILE_FN = async (
  self: ClientSimulator,
  symbol: string,
  idea: ISimulatorIdea,
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

  // медиана подписанных ходов close-ов от входа — сырьё метрики
  // "retain": median >= X означает "цена простояла на/выше +X% не
  // меньше половины горизонта" без единой новой временной константы
  const moves = candles
    .map(({ close }) => (direction * (close - entryPrice) * 100) / entryPrice)
    .sort((a, b) => a - b);
  const half = Math.floor(moves.length / 2);
  const medianMovePercent =
    moves.length % 2 === 1 ? moves[half] : (moves[half - 1] + moves[half]) / 2;

  const lastClose = candles[candles.length - 1].close;
  return {
    idea,
    entryTimestamp,
    entryPrice,
    candles,
    hit: direction * (lastClose - entryPrice) > 0,
    outcomeKnownAt: entryTimestamp + candles.length * MINUTE_MS,
    truncated: candles.length < IDEA_TRIM_MINUTES,
    maxMfePercent,
    maxMaePercent,
    minutesToMfe,
    minutesToMae,
    shakeoutMaePercent,
    medianMovePercent,
  };
};

/**
 * Ban-rule dependent filter context of one (minAuthorTrack,
 * minAuthorHitRate) pair: the trained stats, the banned set and the
 * per-profile banned flags. Built once per unique ban-rule
 * combination of the grid.
 */
interface IAuthorFilterContext {
  stats: ISimulatorAuthorStat[];
  banned: Set<string>;
  /** Ideas of banned authors among profiles. */
  bannedIdeas: number;
  /** authorBanned per profile index. */
  profileBanned: boolean[];
}

/**
 * Derives the ban-filter rule from a grid point as a discriminated
 * union — the ONLY place the metric fallback lives. The "close" rule
 * structurally carries no lock/stop fields: with authorMetric
 * "close" the point's profitLockPercent/hardStopPercent do not
 * affect ban-list training at all (see the filter cache key — they
 * are not part of it either). A reach/retain point with lock = 0
 * has nothing to grade against and degenerates into the "close"
 * rule here, not via scattered runtime branches.
 *
 * @param point - Grid point carrying the rule fields
 * @returns Discriminated ban-filter rule
 */
const AUTHOR_RULE_FN = (point: ISimulatorGridPoint): SimulatorAuthorRule => {
  if (point.authorMetric === "reach" && point.profitLockPercent > 0) {
    return {
      metric: "reach",
      minAuthorTrack: point.minAuthorTrack,
      minAuthorHitRate: point.minAuthorHitRate,
      profitLockPercent: point.profitLockPercent,
      hardStopPercent: point.hardStopPercent,
    };
  }
  if (point.authorMetric === "retain" && point.profitLockPercent > 0) {
    return {
      metric: "retain",
      minAuthorTrack: point.minAuthorTrack,
      minAuthorHitRate: point.minAuthorHitRate,
      profitLockPercent: point.profitLockPercent,
      hardStopPercent: point.hardStopPercent,
    };
  }
  // "pnl" не зависит от lock/stop по построению — деградации нет
  if (point.authorMetric === "pnl") {
    return {
      metric: "pnl",
      minAuthorTrack: point.minAuthorTrack,
      minAuthorHitRate: point.minAuthorHitRate,
    };
  }
  return {
    metric: "close",
    minAuthorTrack: point.minAuthorTrack,
    minAuthorHitRate: point.minAuthorHitRate,
  };
};

/**
 * Author "hit" under a discriminated ban-filter rule.
 *
 * "close" — the idea's horizon close moved in its direction (the
 * profile's precomputed hit); the rule has no lock/stop fields by
 * construction. "reach" — the idea was HARVESTABLE by the rule's
 * lock machinery: MFE reached the profit-lock level and the worst
 * pre-peak pullback (shakeout) stayed above the hard stop. An author
 * whose calls spike to the lock within hours and then die by the
 * horizon close is a miss for "close" and a hit for "reach" —
 * exactly the author a lock point earns on.
 *
 * "retain" — level FIXATION: the MEDIAN move of the horizon sat at
 * or above the rule's level (price held +X% for at least half the
 * trajectory — the 50% share is the median's definition, not a
 * window) while the pre-peak shakeout stayed above the stop. The
 * strictest grading: reach's transient spike and close's lucky
 * last-day finish are both misses here.
 *
 * Same-candle ambiguity (lock and stop both reachable in the candle
 * of the MFE peak) reads as a hit here while SIMULATE_TRADE_FN gives
 * that candle to the stop — the filter metric is slightly more
 * optimistic than execution; it grades authors, not PnL.
 *
 * @param profile - Idea profile
 * @param rule - Discriminated ban-filter rule (see AUTHOR_RULE_FN)
 * @returns Whether the idea counts as the author's hit
 */
const AUTHOR_HIT_FN = (
  profile: ISimulatorIdeaProfile,
  rule: SimulatorAuthorRule,
): boolean => {
  if (rule.metric === "reach") {
    return (
      profile.maxMfePercent >= rule.profitLockPercent &&
      profile.shakeoutMaePercent > -rule.hardStopPercent
    );
  }
  if (rule.metric === "retain") {
    return (
      profile.medianMovePercent >= rule.profitLockPercent &&
      profile.shakeoutMaePercent > -rule.hardStopPercent
    );
  }
  // "pnl": PnL идеи вырос БОЛЬШЕ фиксированного порога — строго
  // больше, независимо от замка и стопа точки
  if (rule.metric === "pnl") {
    return profile.maxMfePercent > PNL_HIT_THRESHOLD_PERCENT;
  }
  return profile.hit;
};

/**
 * Trains the author ban list on the whole simulated range for ONE
 * rule combination — thresholds AND hit metric (lookahead inside
 * train is deliberate — honesty is provided by out-of-sample
 * validation, not by causality inside the train range).
 *
 * Ban is the default: when the author's correctness cannot be proven
 * unambiguously under the given rule, he is banned. Only ideas with
 * a fully observed horizon count as evidence — truncated profiles
 * prove nothing.
 *
 * @param profiles - Profiles of all directional ideas
 * @param ideas - All ideas of the symbol
 * @param rule - Discriminated ban-filter rule: thresholds + metric;
 * lock/stop levels exist ONLY on the "reach" variant — a "close"
 * rule cannot depend on them by construction
 * @returns Filter context for the rule (stats sorted by idea count)
 */
const TRAIN_AUTHOR_FILTER_FN = (
  profiles: ISimulatorIdeaProfile[],
  rule: SimulatorAuthorRule,
): IAuthorFilterContext => {
  const { minAuthorTrack, minAuthorHitRate } = rule;
  const byAuthor = new Map<string, { ideas: number; hits: number }>();
  for (const profile of profiles) {
    const stat = byAuthor.get(profile.idea.author) ?? { ideas: 0, hits: 0 };
    if (!profile.truncated) {
      stat.ideas += 1;
      if (AUTHOR_HIT_FN(profile, rule)) {
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
      stat.ideas < minAuthorTrack ||
      stat.hits / stat.ideas < minAuthorHitRate,
  }));
  const banned = new Set(
    stats.filter(({ banned }) => banned).map(({ author }) => author),
  );
  const profileBanned = profiles.map(({ idea }) => banned.has(idea.author));
  return {
    stats: stats.sort((a, b) => b.ideas - a.ideas),
    banned,
    bannedIdeas: profileBanned.filter(Boolean).length,
    profileBanned,
  };
};

/**
 * Builds the author filter context for an out-of-sample test from a
 * FROZEN track record — the exact opposite of TRAIN_AUTHOR_FILTER_FN:
 * nothing is learned from the given profiles, the raw ideas/hits come
 * from the train run verbatim and only the banned flag is re-derived
 * under the tested point's ban rule (same formulas as in train).
 *
 * Default-ban semantics survive freezing: an author present in the
 * test feed but absent from the frozen stats has proven nothing on
 * the train range — banned.
 *
 * @param profiles - Profiles of the TEST ideas
 * @param ideas - All test ideas of the symbol (for the banned union)
 * @param authorStats - Frozen per-author track record from a train run
 * @param minAuthorTrack - Minimum known-outcome ideas to be allowed
 * @param minAuthorHitRate - Minimum hit rate (0..1) to be allowed
 * @returns Filter context with frozen stats (sorted by idea count)
 */
const FREEZE_AUTHOR_FILTER_FN = (
  profiles: ISimulatorIdeaProfile[],
  ideas: ISimulatorIdea[],
  authorStats: ISimulatorAuthorStat[],
  minAuthorTrack: number,
  minAuthorHitRate: number,
): IAuthorFilterContext => {
  const stats: ISimulatorAuthorStat[] = authorStats.map(
    ({ author, ideas: n, hits }) => ({
      author,
      ideas: n,
      hits,
      hitRate: n ? hits / n : 0,
      banned: n < minAuthorTrack || hits / n < minAuthorHitRate,
    }),
  );
  const allowed = new Set(
    stats.filter(({ banned }) => !banned).map(({ author }) => author),
  );
  // в бане: провалившие правило по замороженному треку ПЛЮС авторы,
  // которых в трейне не было вовсе (недоказанный = забанен)
  const banned = new Set(
    [
      ...stats.map(({ author }) => author),
      ...ideas.map(({ author }) => author),
    ].filter((author) => !allowed.has(author)),
  );
  const profileBanned = profiles.map(({ idea }) => !allowed.has(idea.author));
  return {
    stats: stats.sort((a, b) => b.ideas - a.ideas),
    banned,
    bannedIdeas: profileBanned.filter(Boolean).length,
    profileBanned,
  };
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
 * - profit lock arms from previous-candle peaks the same way: once
 *   price has touched +lock% from entry, a FIXED floor sits at that
 *   level and a pullback to it exits; a runner is untouched — when
 *   the peak clears the lock, the trailing floor rises above it and
 *   the pullback hits the trailing level first;
 * - stop and any profit floor reachable inside one candle -> stop
 *   wins; both floors reachable -> the HIGHER one fills (falling
 *   price crosses it first);
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
  const lockLevel =
    point.profitLockPercent > 0
      ? entryFill * (1 + (direction * point.profitLockPercent) / 100)
      : null;

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
    const lockArmed =
      lockLevel !== null &&
      (direction > 0 ? peak >= lockLevel : peak <= lockLevel);
    const lockHit =
      lockArmed &&
      (direction > 0 ? adverse <= lockLevel! : adverse >= lockLevel!);
    if (stopHit) {
      exitLevel = stopLevel;
      exitReason = "hard_stop";
      exitIndex = i;
      break;
    }
    // оба пола пробиты одной свечой: падающая цена сперва проходит
    // ВЕРХНИЙ из взведённых уровней — он и исполняется
    if (trailHit && lockHit) {
      const trailBetter =
        direction > 0 ? trailLevel >= lockLevel! : trailLevel <= lockLevel!;
      exitLevel = trailBetter ? trailLevel : lockLevel!;
      exitReason = trailBetter ? "trailing_take" : "profit_lock";
      exitIndex = i;
      break;
    }
    if (trailHit) {
      exitLevel = trailLevel;
      exitReason = "trailing_take";
      exitIndex = i;
      break;
    }
    if (lockHit) {
      exitLevel = lockLevel!;
      exitReason = "profit_lock";
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
    absorbedIdeaIds: [],
  };
};

/**
 * Holding time distribution: mean and tail percentiles (nearest
 * rank). Eternal holds are visible in the tail, not in the mean —
 * a couple of dead trades barely move the average but instantly
 * push p95/p99 to the hold cap.
 *
 * @param holdMinutes - Holding times of trades, minutes (any order)
 * @returns Mean, p95 and p99 of the distribution (zeros when empty)
 */
const COMPUTE_HOLD_STATS_FN = (
  holdMinutes: number[],
): {
  avgHoldMinutes: number;
  p95HoldMinutes: number;
  p99HoldMinutes: number;
} => {
  const holds = [...holdMinutes].sort((a, b) => a - b);
  const percentile = (percent: number): number =>
    holds.length
      ? holds[
          Math.min(holds.length - 1, Math.floor((percent / 100) * holds.length))
        ]
      : 0;
  return {
    avgHoldMinutes: holds.length
      ? holds.reduce((acc, value) => acc + value, 0) / holds.length
      : 0,
    p95HoldMinutes: percentile(95),
    p99HoldMinutes: percentile(99),
  };
};

/**
 * Evaluates one grid point with production slot semantics: one
 * position per symbol, ideas arriving while the slot is busy are
 * skipped, any unbanned author's idea triggers an entry. The trained
 * author filter is preprocessing and is always applied.
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
 * @param filter - Author filter context of the point's ban rule
 * @param rangeStartTs - Start of the shared daily bucket window
 * @param rangeDays - Number of daily buckets in the shared window
 * @returns Aggregated report and the trade list
 */
const EVALUATE_POINT_FN = (
  profiles: ISimulatorIdeaProfile[],
  point: ISimulatorGridPoint,
  filter: IAuthorFilterContext,
  rangeStartTs: number,
  rangeDays: number,
): { report: ISimulatorPointReport; trades: ISimulatorTrade[] } => {
  const trades: ISimulatorTrade[] = [];
  const exitReasons: Record<SimulatorExitReason, number> = {
    hard_stop: 0,
    trailing_take: 0,
    profit_lock: 0,
    time_expired: 0,
    data_truncated: 0,
  };
  let skippedBusy = 0;
  let busyUntil = -Infinity;
  // сделка, держащая слот сейчас, — ей приписываются поглощённые посты
  let holdingTrade: ISimulatorTrade | null = null;

  for (let index = 0; index < profiles.length; index++) {
    const profile = profiles[index];
    if (filter.profileBanned[index]) {
      continue;
    }
    if (profile.entryTimestamp < busyUntil) {
      skippedBusy += 1;
      if (holdingTrade) {
        holdingTrade.absorbedIdeaIds.push(profile.idea.id);
      }
      continue;
    }
    const trade = SIMULATE_TRADE_FN(profile, point);
    trades.push(trade);
    exitReasons[trade.exitReason] += 1;
    busyUntil = trade.exitTimestamp + MINUTE_MS;
    holdingTrade = trade;
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

  const holdStats = COMPUTE_HOLD_STATS_FN(
    trades.map(({ holdMinutesActual }) => holdMinutesActual),
  );

  // Calmar — годовая доходность к просадке кривой (окно корзин общее
  // для всех точек), recovery — сырой PnL к той же просадке; без
  // просадки при положительном PnL оба бесконечны (как profitFactor)
  const annualizedPnlPercent = rangeDays > 0
    ? totalPnlPercent * (365 / rangeDays)
    : 0;
  const calmarRatio =
    maxSeriesDrawdownPercent > 0
      ? annualizedPnlPercent / maxSeriesDrawdownPercent
      : totalPnlPercent > 0
        ? Number.POSITIVE_INFINITY
        : 0;
  const recoveryFactor =
    maxSeriesDrawdownPercent > 0
      ? totalPnlPercent / maxSeriesDrawdownPercent
      : totalPnlPercent > 0
        ? Number.POSITIVE_INFINITY
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
      calmarRatio,
      recoveryFactor,
      avgHoldMinutes: holdStats.avgHoldMinutes,
      p95HoldMinutes: holdStats.p95HoldMinutes,
      p99HoldMinutes: holdStats.p99HoldMinutes,
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
        axes.minAuthorTrack.flatMap((minAuthorTrack) =>
          axes.minAuthorHitRate.flatMap((minAuthorHitRate) =>
            axes.profitLockPercent.flatMap((profitLockPercent) =>
              axes.authorMetric.map((authorMetric) => ({
                hardStopPercent,
                trailingTakePercent,
                holdMinutes,
                minAuthorTrack,
                minAuthorHitRate,
                profitLockPercent,
                authorMetric,
              })),
            ),
          ),
        ),
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
    if (
      trade.exitReason === "profit_lock" &&
      trade.pnlPercent < point.profitLockPercent - costFloor
    ) {
      throw new Error(
        `ClientSimulator invariant: profit lock filled below its level ${trade.pnlPercent.toFixed(3)} ` +
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
 * filter training -> grid evaluation -> four rankings.
 *
 * Every progress point the reference Sweep script printed to console
 * is emitted through ISimulatorCallbacks instead.
 *
 * @param self - ClientSimulator instance reference
 * @param symbol - Trading pair symbol
 * @param allIdeas - Ideas to simulate (other symbols are filtered out)
 * @returns Final result with reports and rankings; the author artifact lives per-winner in best[]
 */
const RUN_FN = async (
  self: ClientSimulator,
  symbol: string,
  allIdeas: ISimulatorIdea[],
): Promise<ISimulatorResult> => {
  const ideas = allIdeas
    .filter((idea) => idea.symbol === symbol)
    .sort((a, b) => a.ts - b.ts);
  const directional = DEDUPE_IDEAS_FN(
    ideas.filter(({ direction }) => direction !== "NEUTRAL"),
  );
  if (self.params.callbacks?.onIdeas) {
    self.params.callbacks?.onIdeas(symbol, ideas.length, directional.length);
  }

  const profiles: ISimulatorIdeaProfile[] = [];
  for (let index = 0; index < directional.length; index++) {
    const profile = await BUILD_PROFILE_FN(self, symbol, directional[index]);
    if (profile) {
      profiles.push(profile);
    }
    if (self.params.callbacks?.onProgress) {
      self.params.callbacks?.onProgress(
        symbol,
        "profiles",
        index + 1,
        directional.length,
      );
    }
  }
  const truncatedCount = profiles.filter(({ truncated }) => truncated).length;
  if (self.params.callbacks?.onProfiles) {
    self.params.callbacks?.onProfiles(symbol, profiles, truncatedCount);
  }

  // фильтр авторов обучается по разу на каждое уникальное ПРАВИЛО —
  // дискриминирующий юнион AUTHOR_RULE_FN канонизирует его: у close
  // полей lock/stop нет по построению (они НЕ влияют на бан-лист и в
  // ключ не входят), reach/retain несут lock/stop своей точки, а с
  // lock=0 деградируют в close ещё в билдере
  const filterByRule = new Map<string, IAuthorFilterContext>();
  const getFilter = (point: ISimulatorGridPoint): IAuthorFilterContext => {
    const rule = AUTHOR_RULE_FN(point);
    const key =
      rule.metric === "close" || rule.metric === "pnl"
        ? `${rule.metric}:${rule.minAuthorTrack}:${rule.minAuthorHitRate}`
        : `${rule.metric}:${rule.minAuthorTrack}:${rule.minAuthorHitRate}:${rule.profitLockPercent}:${rule.hardStopPercent}`;
    let filter = filterByRule.get(key);
    if (!filter) {
      filter = TRAIN_AUTHOR_FILTER_FN(profiles, rule);
      filterByRule.set(key, filter);
      if (self.params.callbacks?.onAuthorsTrained) {
        self.params.callbacks?.onAuthorsTrained(
          symbol,
          filter.stats,
          filter.bannedIdeas,
        );
      }
    }
    return filter;
  };

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
  const allHoldMinutes: number[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const { report, trades } = EVALUATE_POINT_FN(
      profiles,
      point,
      getFilter(point),
      rangeStartTs,
      rangeDays,
    );
    ASSERT_TRADE_INVARIANTS_FN(trades, point);
    reports.push(report);
    tradesByReport.set(report, trades);
    for (const trade of trades) {
      allHoldMinutes.push(trade.holdMinutesActual);
    }
    if (self.params.callbacks?.onGridPoint) {
      self.params.callbacks?.onGridPoint(symbol, report, trades);
    }
    if (self.params.callbacks?.onProgress) {
      self.params.callbacks?.onProgress(
        symbol,
        "grid",
        index + 1,
        points.length,
      );
    }
  }
  const holdStats = COMPUTE_HOLD_STATS_FN(allHoldMinutes);

  const rankings: {
    criterion: SimulatorRankingCriterion;
    value: (report: ISimulatorPointReport) => number;
  }[] = [
    { criterion: "sharpe", value: ({ sharpe }) => sharpe },
    { criterion: "sortino", value: ({ sortino }) => sortino },
    { criterion: "pnl", value: ({ totalPnlPercent }) => totalPnlPercent },
    { criterion: "recovery", value: ({ recoveryFactor }) => recoveryFactor },
  ];
  const eligible = reports.filter(
    ({ trades }) => trades >= MIN_TRADES_FOR_BEST,
  );
  const best: ISimulatorBest[] = [];
  // равенство проверяется до вычитания: Infinity - Infinity = NaN
  // ломает контракт компаратора (sortino/profitFactor бесконечны
  // на сериях без убытков)
  const byRankingDesc =
    (value: (report: ISimulatorPointReport) => number) =>
    (a: ISimulatorPointReport, b: ISimulatorPointReport) => {
      const va = value(a);
      const vb = value(b);
      if (va === vb) {
        return 0;
      }
      return vb - va;
    };
  for (const ranking of rankings) {
    const sorted = [...reports].sort(byRankingDesc(ranking.value));
    const winner =
      [...eligible].sort(byRankingDesc(ranking.value))[0] ??
      sorted[0] ??
      null;
    // артефакт авторов — под правило бана ИМЕННО ЭТОГО победителя:
    // критерии могут выбрать точки с разными правилами, и белый
    // список — свойство точки, а не глобаль прогона
    const winnerStats = winner ? getFilter(winner.point).stats : [];
    const bestEntry: ISimulatorBest = {
      criterion: ranking.criterion,
      report: winner,
      trades: winner ? (tradesByReport.get(winner) ?? []) : [],
      authorStats: winnerStats,
      allowedAuthors: winnerStats
        .filter(({ banned }) => !banned)
        .map(({ author }) => author),
      bannedAuthors: winnerStats
        .filter(({ banned }) => banned)
        .map(({ author }) => author),
    };
    best.push(bestEntry);
    if (self.params.callbacks?.onRanking) {
      self.params.callbacks?.onRanking(
        symbol,
        ranking.criterion,
        sorted,
        bestEntry,
      );
    }
  }
  // порядок reports в результате — контракт потребителя run():
  // критерий задаёт схема (reportOrder, дефолт подставлен на уровне
  // params в connection-сервисе), компаратор — защищённый (наивное
  // вычитание ломается на Infinity sortino/recovery серий без
  // убытков)
  const orderValue =
    rankings.find(({ criterion }) => criterion === self.params.reportOrder)
      ?.value ?? rankings[0].value;
  reports.sort(byRankingDesc(orderValue));
  // словарь отчётов по метрике точки — презентационная группировка
  // (рейтинги и best[] считаются по ВСЕМ корзинам вместе); каждый
  // ключ существует всегда, невыметаемая метрика = пустой список
  const reportsByMetric: Record<
    SimulatorAuthorMetric,
    ISimulatorPointReport[]
  > = { close: [], reach: [], retain: [], pnl: [] };
  for (const report of reports) {
    reportsByMetric[report.point.authorMetric].push(report);
  }

  // ран-левел артефакт агрегируется по победителям критериев из
  // gridAxes.banCriteria (конфиг прогона, не ось перебора): allowed =
  // союз их белых списков, banned = забанен каждым из них. BC-ручка:
  // схема с banCriteria ["sharpe"] получает прежний артефакт ровно по
  // Sharpe-победителю. Полная разбивка — в best[].authorStats
  const banCriteria = new Set(self.params.gridAxes.banCriteria);
  const valueByCriterion = new Map(
    rankings.map(({ criterion, value }) => [criterion, value]),
  );
  const allowedUnion = new Set<string>();
  const everyAuthor = new Set<string>();
  for (const bestEntry of best) {
    if (!banCriteria.has(bestEntry.criterion)) {
      continue;
    }
    for (const { author } of bestEntry.authorStats) {
      everyAuthor.add(author);
    }
    // победитель с нефинитным значением рейтинга (Infinity у
    // sortino/recovery на кривой без просадки, NaN) — представитель
    // класса ничьих, выбранный порядком сетки, а не превосходством.
    // Хуй-пойми-какое число — не основание раздавать допуски: его
    // авторы учтены в пуле (дефолт-бан), но белый список не входит
    const value = bestEntry.report
      ? valueByCriterion.get(bestEntry.criterion)!(bestEntry.report)
      : Number.NaN;
    if (!Number.isFinite(value)) {
      continue;
    }
    for (const author of bestEntry.allowedAuthors) {
      allowedUnion.add(author);
    }
  }
  const result: ISimulatorResult = {
    symbol,
    ideasTotal: ideas.length,
    ideasDirectional: directional.length,
    profileCount: profiles.length,
    truncatedCount,
    allowedAuthors: [...allowedUnion],
    bannedAuthors: [...everyAuthor].filter(
      (author) => !allowedUnion.has(author),
    ),
    avgHoldMinutes: holdStats.avgHoldMinutes,
    p95HoldMinutes: holdStats.p95HoldMinutes,
    p99HoldMinutes: holdStats.p99HoldMinutes,
    reports: reportsByMetric,
    best,
  };
  if (self.params.callbacks?.onDone) {
    self.params.callbacks?.onDone(symbol, result);
  }
  return result;
};

/**
 * Out-of-sample test for a symbol: fresh ideas -> profiles -> ONE
 * frozen grid point evaluated with a FROZEN author track record.
 *
 * This is the honesty counterpart of RUN_FN: run() trains the author
 * filter with deliberate lookahead inside the train range, test()
 * proves the picked parameters on data the training never saw —
 * nothing here feeds back into the stats.
 *
 * @param self - ClientSimulator instance reference
 * @param symbol - Trading pair symbol
 * @param allIdeas - Test ideas (other symbols are filtered out)
 * @param point - Frozen grid point from the train run
 * @param authorStats - Frozen per-author track record from the train run
 * @returns Out-of-sample result with the point report and trades
 */
const TEST_FN = async (
  self: ClientSimulator,
  symbol: string,
  allIdeas: ISimulatorIdea[],
  point: ISimulatorGridPoint,
  authorStats: ISimulatorAuthorStat[],
): Promise<ISimulatorTestResult> => {
  const ideas = allIdeas
    .filter((idea) => idea.symbol === symbol)
    .sort((a, b) => a.ts - b.ts);
  const directional = DEDUPE_IDEAS_FN(
    ideas.filter(({ direction }) => direction !== "NEUTRAL"),
  );
  if (self.params.callbacks?.onIdeas) {
    self.params.callbacks?.onIdeas(symbol, ideas.length, directional.length);
  }

  const profiles: ISimulatorIdeaProfile[] = [];
  for (let index = 0; index < directional.length; index++) {
    const profile = await BUILD_PROFILE_FN(self, symbol, directional[index]);
    if (profile) {
      profiles.push(profile);
    }
    if (self.params.callbacks?.onProgress) {
      self.params.callbacks?.onProgress(
        symbol,
        "profiles",
        index + 1,
        directional.length,
      );
    }
  }
  const truncatedCount = profiles.filter(({ truncated }) => truncated).length;
  if (self.params.callbacks?.onProfiles) {
    self.params.callbacks?.onProfiles(symbol, profiles, truncatedCount);
  }

  // фильтр авторов ЗАМОРОЖЕН: правило точки применяется к train-треку,
  // onAuthorsTrained намеренно не эмитится — здесь ничего не обучается
  const filter = FREEZE_AUTHOR_FILTER_FN(
    profiles,
    directional,
    authorStats,
    point.minAuthorTrack,
    point.minAuthorHitRate,
  );

  // окно суточных корзин — по тестовому диапазону: метрики отчёта
  // считаются той же математикой, что в run(), но по свежим данным
  const rangeStartTs = profiles.length
    ? Math.min(...profiles.map(({ entryTimestamp }) => entryTimestamp))
    : 0;
  const rangeEndTs = profiles.length
    ? Math.max(...profiles.map(({ outcomeKnownAt }) => outcomeKnownAt))
    : 0;
  const rangeDays = Math.max(1, Math.ceil((rangeEndTs - rangeStartTs) / DAY_MS));

  const { report, trades } = EVALUATE_POINT_FN(
    profiles,
    point,
    filter,
    rangeStartTs,
    rangeDays,
  );
  ASSERT_TRADE_INVARIANTS_FN(trades, point);
  if (self.params.callbacks?.onGridPoint) {
    self.params.callbacks?.onGridPoint(symbol, report, trades);
  }
  if (self.params.callbacks?.onProgress) {
    self.params.callbacks?.onProgress(symbol, "grid", 1, 1);
  }

  const holdStats = COMPUTE_HOLD_STATS_FN(
    trades.map(({ holdMinutesActual }) => holdMinutesActual),
  );

  const result: ISimulatorTestResult = {
    symbol,
    ideasTotal: ideas.length,
    ideasDirectional: directional.length,
    profileCount: profiles.length,
    truncatedCount,
    point,
    report,
    trades,
    authorStats: filter.stats,
    allowedAuthors: filter.stats
      .filter(({ banned }) => !banned)
      .map(({ author }) => author),
    bannedAuthors: [...filter.banned],
    avgHoldMinutes: holdStats.avgHoldMinutes,
    p95HoldMinutes: holdStats.p95HoldMinutes,
    p99HoldMinutes: holdStats.p99HoldMinutes,
  };
  if (self.params.callbacks?.onTestDone) {
    self.params.callbacks?.onTestDone(symbol, result);
  }
  return result;
};

/**
 * Parameter sweep engine over crowd trading ideas (the "Simulator").
 *
 * Finds production strategy parameters (hard stop, trailing take,
 * hold duration, author ban rule) by simulating every idea against
 * every point of the grid — WITHOUT re-running a backtest per point.
 * Authors are graded STRICTLY in isolation — no interaction metrics
 * (consensus counting, vote weighting) exist here by design; swarm
 * ranking over long histories is userspace. The root iteration is
 * over IDEAS, not candles and not grid points:
 *
 * 1. Each idea gets ONE asynchronous forward candle pass from the
 *    minute after its publication, capped by a static horizon
 *    (IDEA_TRIM_DAYS). The pass produces a per-candle trajectory
 *    profile (MFE/MAE extremes, whale shakeout depth). Overlapping
 *    and sparse ideas are both supported: candle chunks are fetched
 *    lazily through the Exchange (persist cache first), gaps between
 *    ideas are never requested.
 * 2. The author ban list is TRAINED on the whole range (lookahead
 *    inside train is deliberate): authors with enough ideas and a hit
 *    rate worse than a coin are excluded from entries. The list is
 *    part of the result — apply it in production as-is.
 * 3. The outcome of every grid point is derived arithmetically from
 *    the profiles with production slot semantics (one position per
 *    symbol, busy-slot ideas skipped). Honesty contracts: entry at
 *    next-minute open, exits by candle wicks (never close-to-close),
 *    stop wins inside an ambiguous candle, trailing arms only from
 *    previous-candle peaks, fees and slippage from GLOBAL_CONFIG on
 *    both legs.
 * 4. Grid winners are picked by four rankings (Sharpe, Sortino, PnL,
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
   *    drops NEUTRAL ideas and flood duplicates (at most one idea
   *    per author per direction per AUTHOR_DEDUPE_MINUTES)
   *    -> onIdeas(symbol, total, directional).
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
   * @returns Final result: grid reports keyed by author metric (each
   * bucket sorted by reportOrder),
   * winners of the four rankings with their trade lists, and the
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

  /**
   * Out-of-sample test: evaluates ONE frozen grid point over fresh
   * ideas with a FROZEN author track record from a train run.
   *
   * Steps and emitted callbacks:
   * 1. Filters the input array by symbol, sorts by publication time,
   *    drops NEUTRAL ideas and flood duplicates (same preprocessing
   *    as run()) -> onIdeas(symbol, total, directional).
   * 2. Builds one trajectory profile per test idea
   *    -> onProfiles(symbol, profiles, truncatedCount).
   * 3. FREEZES the author filter: the point's ban rule is applied to
   *    the given train stats verbatim; authors unseen in the stats
   *    are banned by default. onAuthorsTrained never fires — nothing
   *    is trained on the test data.
   * 4. Evaluates the single point with production slot semantics and
   *    the same metric math as run()
   *    -> onGridPoint(symbol, report, trades).
   * 5. Assembles the result -> onTestDone(symbol, result).
   *
   * @param symbol - Trading pair symbol to test (e.g., "BTCUSDT")
   * @param ideas - Out-of-sample ideas feed (other symbols filtered out)
   * @param point - Frozen grid point (e.g., the train Sharpe winner)
   * @param authorStats - Frozen author track record from the train run
   * @returns Out-of-sample result: the point report, trades and the
   * frozen author artifact as applied on the test range
   * @throws Error when a trade violates the arithmetic invariants
   */
  public test = async (
    symbol: string,
    ideas: ISimulatorIdea[],
    point: ISimulatorGridPoint,
    authorStats: ISimulatorAuthorStat[],
  ): Promise<ISimulatorTestResult> => {
    this.params.logger.debug("ClientSimulator test", {
      symbol,
      ideasLen: ideas.length,
      point,
    });
    return await TEST_FN(this, symbol, ideas, point, authorStats);
  }
}