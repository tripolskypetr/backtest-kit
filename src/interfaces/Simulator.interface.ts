import { ExchangeName, ICandleData } from "./Exchange.interface";
import { ILogger } from "./Logger.interface";

/**
 * Direction of a trading idea (crowd forecast).
 */
export type SimulatorIdeaDirection = "LONG" | "SHORT" | "NEUTRAL";

/**
 * Single trading idea: a public forecast published by an author.
 * The unit of simulation — candles are iterated per idea, not per grid point.
 */
export interface ISimulatorIdea {
  /** Unique idea identifier from the source platform. */
  id: number;
  /** Unix timestamp in milliseconds when the idea was published. */
  ts: number;
  /** Trading pair symbol the idea refers to (e.g., "BTCUSDT"). */
  symbol: string;
  /** Forecast direction claimed by the author. */
  direction: SimulatorIdeaDirection;
  /** Author login on the source platform (unique per author). */
  author: string;
}

/**
 * Per-candle trajectory profile of a single idea.
 * The outcome of ANY grid point is computed arithmetically from the
 * profile — candles are never re-iterated per grid point.
 */
export interface ISimulatorIdeaProfile {
  /** The idea this profile belongs to. */
  idea: ISimulatorIdea;
  /** Entry minute: the minute FOLLOWING publication (no lookahead). */
  entryTimestamp: number;
  /** Open price of the first candle (entry basis before slippage). */
  entryPrice: number;
  /** Candle trajectory of the idea horizon (shared chunk references). */
  candles: ICandleData[];
  /** Idea correctness: horizon return in its direction is positive. */
  hit: boolean;
  /** Timestamp when the idea outcome becomes known (horizon end). */
  outcomeKnownAt: number;
  /** Horizon was truncated by end of data, not by the trim constant. */
  truncated: boolean;
  /** Maximum favorable excursion from entry, percent (by wicks). */
  maxMfePercent: number;
  /** Maximum adverse excursion from entry, percent (by wicks, negative). */
  maxMaePercent: number;
  /** Minutes from entry to the maximum favorable excursion. */
  minutesToMfe: number;
  /** Minutes from entry to the maximum adverse excursion. */
  minutesToMae: number;
  /** Worst MAE BEFORE the max-MFE candle — whale shakeout depth. */
  shakeoutMaePercent: number;
  /**
   * MEDIAN of the per-candle close moves from entry over the whole
   * horizon, percent in the idea's direction. The raw material of
   * the "retain" author metric: median > X means price sat ABOVE
   * entry + X% for at least half the observed trajectory — a
   * time-window-free fixation measure (the 50% share is the
   * median's definition, not a tunable constant), insensitive to
   * the exact horizon length unlike the close. The field itself is
   * level-free; the retain rule grades it against the point's lock.
   */
  medianMovePercent: number;
}

/**
 * Metric that defines an author's "hit" for the ban filter:
 * - "close" — the idea's horizon close moved in its direction
 *   (rewards authors whose calls survive a long hold). The horizon
 *   is the grid's LONGEST hold — max(holdMinutes) — for every
 *   metric here: the schema defines the grading window, not an
 *   engine constant;
 * - "reach" — the idea's MFE reached the point's profit-lock level
 *   before its pre-peak MAE reached the hard stop (rewards authors
 *   whose calls are HARVESTABLE by the lock machinery, even when the
 *   horizon close goes against them). Requires a target: reach
 *   points with profitLockPercent = 0 are excluded from the grid;
 * - "retain" — FIXATION above the point's profit-lock level: the
 *   MEDIAN move of the idea's horizon is strictly above
 *   profitLockPercent, i.e. price sat above entry + lock for at
 *   least half the observed trajectory (the median is the 50%
 *   quantile by definition — no time window is involved). Requires
 *   a target like reach: retain points with profitLockPercent = 0
 *   are excluded from the grid. A transient spike (reach's hit) and
 *   a lucky last-day finish (close's hit) are both misses here.
 *   Independent of the point's stop;
 * - "pnl" — the idea's MFE grew by MORE than the fixed +1% threshold
 *   at any moment of the horizon, INDEPENDENT of the point's lock
 *   and stop. Complements "retain": pnl asks "did it ever pay",
 *   retain asks "did it hold above the level".
 * The right metric depends on the exit style being ranked: close-hit
 * authors feed long-hold points, reach-hit authors feed lock points,
 * retain-hit authors feed points that need the move to HOLD.
 */
export type SimulatorAuthorMetric = "close" | "reach" | "retain" | "pnl";

/**
 * Discriminated union of the ban-filter rule derived from a grid
 * point. The discriminator makes the dependency EXPLICIT at the type
 * level: "reach" carries lock AND stop, "retain" carries only the
 * lock (its fixation level), while "close"/"pnl" never depend on
 * the point's levels, so those fields do not exist on their rules.
 * There is NO fallback of any kind: reach and retain points with
 * profitLockPercent = 0 are excluded from the grid (a rule without
 * a target does not exist — it never silently becomes another
 * rule).
 */
export type SimulatorAuthorRule =
  | {
      /** Discriminator: grade authors by the horizon close. */
      metric: "close";
      /** Minimum known-outcome ideas to be allowed. */
      minAuthorTrack: number;
      /** Minimum hit rate (0..1) to be allowed. */
      minAuthorHitRate: number;
    }
  | {
      /** Discriminator: grade authors by lock-reachability. */
      metric: "reach";
      /** Minimum known-outcome ideas to be allowed. */
      minAuthorTrack: number;
      /** Minimum hit rate (0..1) to be allowed. */
      minAuthorHitRate: number;
      /** Lock level the reach hit is graded against (always > 0). */
      profitLockPercent: number;
      /** Stop level the pre-peak shakeout is graded against. */
      hardStopPercent: number;
    }
  | {
      /**
       * Discriminator: grade authors by FIXATION above the point's
       * lock level.
       */
      metric: "retain";
      /** Minimum known-outcome ideas to be allowed. */
      minAuthorTrack: number;
      /** Minimum hit rate (0..1) to be allowed. */
      minAuthorHitRate: number;
      /** Level the median move is graded against (always > 0). */
      profitLockPercent: number;
    }
  | {
      /**
       * Discriminator: grade authors by the fixed +1% MFE threshold
       * — lock/stop independent by construction (no such fields).
       */
      metric: "pnl";
      /** Minimum known-outcome ideas to be allowed. */
      minAuthorTrack: number;
      /** Minimum hit rate (0..1) to be allowed. */
      minAuthorHitRate: number;
    };

/**
 * Value lists per grid axis. The grid is the cartesian product of
 * all axes; author-ban thresholds are swept the same way as stop
 * and trailing — rules are searched, not hardcoded.
 *
 * Every field below states what it TUNES and under which conditions
 * it is IGNORED — no axis is allowed to be a silent no-op without
 * that being documented here.
 */
export interface ISimulatorGridAxes {
  /**
   * Hard stop levels to sweep, percent from entry.
   * Tunes: the catastrophe exit — how deep a position may sink
   * before a forced loss; the stop WINS when the stop and any profit
   * floor are reachable inside one candle (pessimism contract). Also
   * the shakeout bound of the "reach" author metric.
   * Ignored: never for trading — every trade checks it. For BAN
   * TRAINING only the "reach" rule grades authors against it (see
   * SimulatorAuthorRule).
   */
  hardStopPercent: number[];
  /**
   * Trailing take pullback levels to sweep, percent from the peak.
   * Tunes: how much of a runner's peak is given back. Arms only from
   * PREVIOUS-candle peaks and only when the locked level is not
   * worse than entry (peak >= entry/(1 - r)).
   * Ignored: inert for any trade whose peak never reaches the arm
   * level — such trades exit by stop, lock, or the hold cap. Never
   * affects ban training under any metric.
   */
  trailingTakePercent: number[];
  /**
   * Maximum position hold durations to sweep, minutes.
   * Tunes: slot turnover — one position per symbol, and a busy slot
   * ABSORBS qualified ideas (per-trade absorbedIdeaIds), so longer
   * holds trade less often; the cap is the worst-case exit
   * (time_expired) when neither stop nor floor fires.
   * Ignored: never for trading. Ban training does not use the
   * POINT'S hold — an author's hit is graded on the idea's full
   * profile horizon, which is this axis's MAXIMUM: the longest hold
   * declared here defines every idea's forward candle window (the
   * schema owns the horizon, the engine has no hidden constant).
   */
  holdMinutes: number[];
  /**
   * Author ban rule to sweep: minimum ideas with a FULLY OBSERVED
   * outcome an author needs before he can be allowed (fewer ->
   * banned by default; truncated profiles prove nothing).
   * Tunes: how much evidence "proven" requires.
   * Ignored: never — the rule trains under every author metric;
   * WHAT counts as a hit is decided by authorMetric.
   */
  minAuthorTrack: number[];
  /**
   * Author ban rule to sweep: minimum hit rate (0..1) an author
   * needs to be allowed. The ban is STRICTLY below the threshold —
   * an author exactly at it stays allowed.
   * Tunes: required author quality; on the reference data quality
   * mattered more than track length on every ranking.
   * Ignored: never — trains under every metric; the hit definition
   * follows authorMetric.
   */
  minAuthorHitRate: number[];
  /**
   * Profit lock levels to sweep, percent from entry. When price
   * TOUCHES +X% a fixed floor arms at that level and the trade exits
   * only on a PULLBACK to the floor — unlike a plain fixed take, a
   * runner keeps running and is later handled by the trailing take
   * (whose floor rises above the lock once the peak clears it).
   * Covers the zone where the trailing take is not armed yet (peak
   * below entry/(1 - r)) and profit would otherwise bleed back.
   * Tunes: harvesting the crowd-liquidity step without cutting
   * runners. Also the grading level of the "reach" and "retain"
   * author metrics. Ignored: 0 DISABLES the mechanism for trading,
   * and reach/retain points with lock = 0 DO NOT EXIST — the
   * combination is excluded from the cartesian product (a rule
   * without a target is not a rule). Under "close"/"pnl" the level
   * never affects ban training — trading only.
   */
  profitLockPercent: number[];
  /**
   * Author-hit metrics to sweep for the ban filter — a rule
   * parameter like the thresholds. Each metric is graded SEPARATELY:
   * the sweep never glues incomparable hit counts together, it
   * reports every grading as its own points and its own ban lists.
   * Tunes: which author grading feeds which exit style — "close"
   * (horizon close) rewards authors whose calls survive a long
   * hold, "reach" (lock-reachability against THE POINT'S lock/stop)
   * rewards the authors a lock point actually earns on, "retain"
   * (median move above THE POINT'S lock) rewards authors whose
   * moves HOLD the level, "pnl" (fixed +1% MFE threshold) asks "did
   * the call ever pay"; the same author has different hit counts
   * under different metrics.
   * Ignored: with "close"/"pnl" the point's lock/stop never affect
   * ban training; "retain" ignores only the stop; "reach"/"retain"
   * require lock > 0 — the lock-free combinations are excluded from
   * the grid, never silently regraded.
   */
  authorMetric: SimulatorAuthorMetric[];
}

/**
 * Single point of the grid (scalar per axis).
 */
export interface ISimulatorGridPoint {
  /** Hard stop level, percent from entry. */
  hardStopPercent: number;
  /** Trailing take pullback, percent from the running peak. */
  trailingTakePercent: number;
  /** Maximum position hold duration, minutes. */
  holdMinutes: number;
  /** Author ban rule: minimum known-outcome ideas to be allowed. */
  minAuthorTrack: number;
  /** Author ban rule: minimum hit rate (0..1) to be allowed. */
  minAuthorHitRate: number;
  /**
   * Profit lock: fixed floor armed when price touches +X% from
   * entry, exit on pullback to the floor; 0 = disabled.
   */
  profitLockPercent: number;
  /** Author-hit metric of the ban filter for this point. */
  authorMetric: SimulatorAuthorMetric;
}

/**
 * Why a simulated trade was closed.
 */
export type SimulatorExitReason =
  | "hard_stop"
  | "trailing_take"
  | "profit_lock"
  | "time_expired"
  | "data_truncated";

/**
 * Single simulated trade: an idea evaluated against a grid point.
 */
export interface ISimulatorTrade {
  /** Identifier of the idea that triggered the trade. */
  ideaId: number;
  /** Position direction inherited from the idea. */
  direction: SimulatorIdeaDirection;
  /** Unix timestamp in milliseconds of the trade entry minute. */
  entryTimestamp: number;
  /** Unix timestamp in milliseconds of the exit candle. */
  exitTimestamp: number;
  /** Why the trade was closed. */
  exitReason: SimulatorExitReason;
  /** Actual holding time, minutes (entry candle inclusive). */
  holdMinutesActual: number;
  /** Trade PnL percent, net of fees on both legs. */
  pnlPercent: number;
  /**
   * Ideas that qualified for entry but were ABSORBED by this trade
   * holding the slot. A long hold that eats foreign recommendations
   * is visible here idea by idea.
   */
  absorbedIdeaIds: number[];
}

/**
 * Aggregated metrics of one grid point (production slot semantics).
 */
export interface ISimulatorPointReport {
  /** The grid point these metrics belong to. */
  point: ISimulatorGridPoint;
  /** Number of simulated trades. */
  trades: number;
  /** Qualified ideas skipped because the position slot was busy. */
  skippedBusy: number;
  /** Sum of trade PnL percents over the range. */
  totalPnlPercent: number;
  /** Mean trade PnL, percent. */
  avgPnlPercent: number;
  /** Share of profitable trades, 0..1. */
  winRate: number;
  /** Gross profit divided by gross loss; Infinity when no losses. */
  profitFactor: number;
  /** Maximum drawdown of the cumulative trade PnL curve, percent. */
  maxSeriesDrawdownPercent: number;
  /**
   * Calmar ratio: total PnL annualized over the shared daily bucket
   * window (x 365/days) divided by maxSeriesDrawdownPercent.
   * Infinity when the curve has no drawdown and PnL is positive
   * (JSON-serializes to null, same as profitFactor/sortino).
   */
  calmarRatio: number;
  /**
   * Recovery factor: total PnL divided by maxSeriesDrawdownPercent.
   * Infinity when the curve has no drawdown and PnL is positive
   * (JSON-serializes to null, same as profitFactor/sortino).
   */
  recoveryFactor: number;
  /** Mean holding time per trade, minutes. */
  avgHoldMinutes: number;
  /** 95th percentile of holding time, minutes — spots eternal holds. */
  p95HoldMinutes: number;
  /** 99th percentile of holding time, minutes — spots eternal holds. */
  p99HoldMinutes: number;
  /**
   * Time-based Sharpe: mean/std * sqrt(days) over DAILY equity
   * increments of the whole simulated range (idle days included,
   * realized PnL booked on the exit day). Penalizes dead holding
   * time — frozen capital is not free.
   */
  sharpe: number;
  /**
   * Time-based Sortino: like sharpe but deviation is computed over
   * negative daily increments only. Infinity when the series has no
   * losing day (consistent with profitFactor; a finite sentinel would
   * mislead — real values can exceed any constant). NB: Infinity
   * JSON-serializes to null in saved artifacts.
   */
  sortino: number;
  /** Trade counts per exit reason. */
  exitReasons: Record<SimulatorExitReason, number>;
}

/**
 * Trained per-author track record (train = the whole simulated range).
 * Ban is the default: an author is allowed only when his correctness
 * is unambiguously proven by enough fully observed ideas. The ban
 * thresholds are grid axes (minAuthorTrack, minAuthorHitRate) — the
 * banned flag is relative to the rule of a concrete grid point.
 */
export interface ISimulatorAuthorStat {
  /** Author login on the source platform. */
  author: string;
  /** Directional ideas with a KNOWN outcome (truncated ones excluded). */
  ideas: number;
  /**
   * Number of the author's hits UNDER THE RULE'S METRIC: horizon
   * close in the idea direction for "close", lock-reachability for
   * "reach" — the same author has different hit counts under
   * different rules.
   */
  hits: number;
  /** hits / ideas, 0..1; zero when the author has no known outcomes. */
  hitRate: number;
  /**
   * Author is banned under the ban rule these stats were computed
   * with. True when the track is too short to judge (ideas <
   * minAuthorTrack) OR the hit rate is below minAuthorHitRate.
   * Unproven correctness = banned.
   */
  banned: boolean;
}

/**
 * Ranking criterion for picking grid winners. "recovery" ranks by
 * recoveryFactor (total PnL / max series drawdown); a calmar ranking
 * would produce the IDENTICAL ordering — within one run calmar is
 * recoveryFactor times a constant (365/days of the shared bucket
 * window) — so only the raw criterion exists.
 */
export type SimulatorRankingCriterion = "sharpe" | "sortino" | "pnl" | "recovery";

/**
 * Winner of one ranking criterion with its trade list and the author
 * artifact under ITS OWN ban rule. Different criteria may elect
 * points with different ban rules — the whitelist is a property of
 * the winning point, never a global of the run or the bucket.
 */
export interface ISimulatorBest {
  /** The ranking criterion this winner belongs to. */
  criterion: SimulatorRankingCriterion;
  /** Winning point report; null when the bucket produced no reports. */
  report: ISimulatorPointReport | null;
  /** Trades of the winning point (empty when report is null). */
  trades: ISimulatorTrade[];
  /**
   * Per-author track records under THIS winner's rule. Hits are
   * counted by the rule's metric and levels, so even the raw
   * numbers differ between winners with different rules. Empty when
   * report is null. The same dictionary sits in the bucket's bans
   * entry carrying the same thresholds/levels.
   */
  authorStats: ISimulatorAuthorStat[];
  /** Whitelist under THIS winner's ban rule. */
  allowedAuthors: string[];
  /** Ban list under THIS winner's ban rule. */
  bannedAuthors: string[];
}

/**
 * Trained ban dictionary of ONE rule: pure threshold arithmetic —
 * an author is allowed exactly when his track under this rule's
 * metric reaches minAuthorTrack ideas at minAuthorHitRate quality.
 * No ranking is involved: bans are properties of rules, not of
 * winners.
 */
export interface ISimulatorRuleBans {
  /** Minimum known-outcome ideas the rule requires. */
  minAuthorTrack: number;
  /** Minimum hit rate (0..1) the rule requires. */
  minAuthorHitRate: number;
  /** Grading level; present on reach and retain rules only. */
  profitLockPercent?: number;
  /** Shakeout stop bound; present on reach rules only. */
  hardStopPercent?: number;
  /** Per-author track records under this rule (sorted by ideas). */
  authorStats: ISimulatorAuthorStat[];
  /** Authors allowed by this rule. */
  allowedAuthors: string[];
  /** Authors banned by this rule (default-ban included). */
  bannedAuthors: string[];
}

/**
 * Self-contained result of ONE author metric: its grid points, its
 * ranking winners and its trained ban dictionaries. Metrics are
 * never glued together — each bucket answers its own question with
 * its own numbers.
 */
export interface ISimulatorMetricReport {
  /**
   * Grid point reports of this metric, sorted descending by the
   * schema's reportOrder criterion (default sharpe).
   */
  reports: ISimulatorPointReport[];
  /**
   * Winners of the four ranking criteria WITHIN this metric bucket
   * (anti-fluke trades floor applies per bucket). Empty when the
   * metric is not swept.
   */
  best: ISimulatorBest[];
  /**
   * Trained ban dictionaries of this bucket — one entry per unique
   * rule, identified by its own threshold/level fields (no
   * synthetic keys). Pure threshold arithmetic — which authors a
   * rule allows does not depend on any ranking.
   */
  bans: ISimulatorRuleBans[];
}

/**
 * Final result of a simulation run: per-metric buckets, each with
 * its own reports, ranking winners and ban dictionaries — hits are
 * metric-dependent, any cross-metric aggregate would lie.
 */
export interface ISimulatorResult {
  /** Trading pair symbol the simulation ran for. */
  symbol: string;
  /** Total ideas of the symbol received (including NEUTRAL). */
  ideasTotal: number;
  /** Directional ideas simulated (NEUTRAL and flood duplicates excluded). */
  ideasDirectional: number;
  /** Number of idea profiles built (ideas with candle data). */
  profileCount: number;
  /** Profiles cut short by end of candle data. */
  truncatedCount: number;
  /** Mean holding time across all trades of every grid point, minutes. */
  avgHoldMinutes: number;
  /** 95th percentile of holding time across the whole grid, minutes. */
  p95HoldMinutes: number;
  /** 99th percentile of holding time across the whole grid, minutes — eternal holds are visible right in the run result. */
  p99HoldMinutes: number;
  /**
   * Per-metric buckets keyed by the point's authorMetric. Every
   * metric key is always present — a metric absent from the swept
   * axis maps to an empty bucket.
   */
  reports: Record<SimulatorAuthorMetric, ISimulatorMetricReport>;
}

/**
 * Result of an out-of-sample test: ONE frozen grid point evaluated
 * over fresh ideas with a FROZEN author track record. Nothing is
 * trained on the test data — the honesty run() deliberately skips
 * (lookahead inside train) is provided here.
 */
export interface ISimulatorTestResult {
  /** Trading pair symbol the test ran for. */
  symbol: string;
  /** Total ideas of the symbol received (including NEUTRAL). */
  ideasTotal: number;
  /** Directional ideas tested (NEUTRAL and flood duplicates excluded). */
  ideasDirectional: number;
  /** Number of idea profiles built (ideas with candle data). */
  profileCount: number;
  /** Profiles cut short by end of candle data. */
  truncatedCount: number;
  /** The frozen grid point the test evaluated (from the train run). */
  point: ISimulatorGridPoint;
  /** Out-of-sample report of the point (same metrics as in run()). */
  report: ISimulatorPointReport;
  /** Trades of the point over the test range. */
  trades: ISimulatorTrade[];
  /**
   * The FROZEN author stats the test was gated by: raw ideas/hits
   * come from the train run verbatim, the banned flag is re-derived
   * under the tested point's ban rule. Test outcomes never feed back
   * into these numbers.
   */
  authorStats: ISimulatorAuthorStat[];
  /** Logins allowed under the frozen stats and the point's ban rule. */
  allowedAuthors: string[];
  /**
   * Logins banned on the test range: train authors failing the rule
   * PLUS authors seen only in the test feed (unproven = banned).
   */
  bannedAuthors: string[];
  /** Mean holding time across the test trades, minutes. */
  avgHoldMinutes: number;
  /** 95th percentile of holding time, minutes. */
  p95HoldMinutes: number;
  /** 99th percentile of holding time, minutes. */
  p99HoldMinutes: number;
}

/**
 * Registration schema of a simulator instance.
 *
 * Field-by-field contract — what each parameter allows to tune and
 * when it is ignored:
 * - simulatorName — registry key; duplicate registration is a
 *   validation error.
 * - exchangeName — candle source for idea profiles. The Exchange
 *   contract is strict (exactly `limit` candles or throw): end of
 *   history surfaces as an exception and becomes a truncated
 *   profile — truncated ideas are traded to the data edge but are
 *   IGNORED as ban-training evidence.
 * - gridAxes — PER-AXIS override merged over the engine defaults:
 *   an omitted axis takes the default LIST and is therefore swept;
 *   a single-value list freezes an axis. Pinning examples:
 *   authorMetric: ["close"] grades authors by the horizon close
 *   only, profitLockPercent: [0] disables the lock. Each axis
 *   documents its own tune/ignore conditions in ISimulatorGridAxes.
 * - callbacks — all optional; an omitted callback is simply never
 *   fired (silent run). onAuthorsTrained fires once per unique ban
 *   RULE (not per grid point) and never fires during test().
 */
export interface ISimulatorSchema {
    /** Unique simulator identifier for the schema registry. */
    simulatorName: SimulatorName;
    /** Exchange schema to fetch candles through. */
    exchangeName: ExchangeName;
    /**
     * Grid axes override, merged per-axis over the defaults at params
     * creation — a schema may override only the axes it cares about.
     */
    gridAxes?: Partial<ISimulatorGridAxes>;
    /**
     * Ranking criterion ordering each metric bucket's reports list
     * (descending). The return value of run() is the consumer
     * contract — callbacks are a side channel — so the order is
     * declared here, not derived. Sorting uses the tie-guarded
     * comparator (naive subtraction breaks on Infinity
     * sortino/recovery of loss-free series). Default: "sharpe".
     * Does not affect best[] or bans in any way.
     */
    reportOrder?: SimulatorRankingCriterion;
    /** Lifecycle callbacks (all optional). */
    callbacks?: Partial<ISimulatorCallbacks>;
}

/**
 * Long-running stage of a simulation run reported by onProgress:
 * "profiles" — one candle pass per idea (dominated by candle IO),
 * "grid" — arithmetic evaluation of grid points.
 */
export type SimulatorProgressStage = "profiles" | "grid";

/**
 * Lifecycle callbacks of a simulation run. Every progress point the
 * reference Sweep script printed to console is exposed here instead.
 */
export interface ISimulatorCallbacks {
  /**
   * Progress of a long-running stage: fires after every processed
   * item — idea (stage "profiles") or grid point (stage "grid").
   * processed grows from 1 to total within a stage.
   */
  onProgress(
    symbol: string,
    stage: SimulatorProgressStage,
    processed: number,
    total: number,
  ): void;
  /** Ideas received: total vs directional (NEUTRAL excluded). */
  onIdeas(symbol: string, ideasTotal: number, ideasDirectional: number): void;
  /**
   * All idea profiles built (one candle pass per idea).
   * truncatedCount — profiles cut short by end of candle data.
   */
  onProfiles(
    symbol: string,
    profiles: ISimulatorIdeaProfile[],
    truncatedCount: number,
  ): void;
  /**
   * Author ban list trained for one ban-rule combination of the grid
   * (fires once per unique minAuthorTrack x minAuthorHitRate pair):
   * per-author stats under that rule and how many ideas belong to
   * banned authors.
   */
  onAuthorsTrained(
    symbol: string,
    stats: ISimulatorAuthorStat[],
    bannedIdeas: number,
  ): void;
  /** One grid point evaluated. */
  onGridPoint(
    symbol: string,
    report: ISimulatorPointReport,
    trades: ISimulatorTrade[],
  ): void;
  /**
   * Ranking computed WITHIN one metric bucket: the bucket's reports
   * sorted by the criterion (descending) and the eligible winner
   * (minimum-trades floor applied per bucket). Fires once per
   * (swept metric x criterion).
   */
  onRanking(
    symbol: string,
    criterion: SimulatorRankingCriterion,
    sorted: ISimulatorPointReport[],
    best: ISimulatorBest,
  ): void;
  /** Simulation finished. */
  onDone(symbol: string, result: ISimulatorResult): void;
  /**
   * Out-of-sample test finished. onAuthorsTrained deliberately never
   * fires during a test — nothing is trained on the test data.
   */
  onTestDone(symbol: string, result: ISimulatorTestResult): void;
}

/**
 * Runtime parameters of a simulator client: the schema with defaults
 * resolved plus injected infrastructure dependencies.
 */
export interface ISimulatorParams extends ISimulatorSchema {
    /** Logger instance for debug output. */
    logger: ILogger;
    /** Grid axes with defaults applied (no longer optional). */
    gridAxes: ISimulatorGridAxes;
    /** Report order with the default applied (no longer optional). */
    reportOrder: SimulatorRankingCriterion;
}

/**
 * Public surface of a simulator client.
 */
export interface ISimulator {
  /**
   * Runs the full simulation for a symbol over the given ideas:
   * profiles -> author filter -> grid evaluation -> rankings.
   */
  run(symbol: string, ideas: ISimulatorIdea[]): Promise<ISimulatorResult>;
  /**
   * Out-of-sample test: evaluates ONE frozen grid point over fresh
   * ideas with a FROZEN author track record from a train run.
   * Profiles are built for the test ideas, but the author filter is
   * NOT retrained — authors unseen in the frozen stats are banned by
   * default (unproven = banned).
   */
  test(
    symbol: string,
    ideas: ISimulatorIdea[],
    point: ISimulatorGridPoint,
    authorStats: ISimulatorAuthorStat[],
  ): Promise<ISimulatorTestResult>;
}

/**
 * Unique simulator identifier.
 */
export type SimulatorName = string;
