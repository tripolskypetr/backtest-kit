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
  /** Unique aligned authors at entry minute (self included). */
  alignedAtEntry: number;
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
}

/**
 * Metric that defines an author's "hit" for the ban filter:
 * - "close" — the idea's 5-day horizon close moved in its direction
 *   (rewards authors whose calls survive a long hold);
 * - "reach" — the idea's MFE reached the point's profit-lock level
 *   before its pre-peak MAE reached the hard stop (rewards authors
 *   whose calls are HARVESTABLE by the lock machinery, even when the
 *   horizon close goes against them). With profitLockPercent = 0 the
 *   reach metric falls back to "close".
 * The right metric depends on the exit style being ranked: close-hit
 * authors feed long-hold points, reach-hit authors feed lock points.
 */
export type SimulatorAuthorMetric = "close" | "reach";

/**
 * Value lists per grid axis. The grid is the cartesian product of
 * all axes; windows and author-ban thresholds are swept the same way
 * as stop and trailing — rules are searched, not hardcoded.
 */
export interface ISimulatorGridAxes {
  /** Hard stop levels to sweep, percent from entry. */
  hardStopPercent: number[];
  /** Trailing take pullback levels to sweep, percent from peak. */
  trailingTakePercent: number[];
  /** Maximum position hold durations to sweep, minutes. */
  holdMinutes: number[];
  /** Entry thresholds to sweep: minimum unique aligned authors. */
  minIdeasAligned: number[];
  /**
   * Author ban rule to sweep: minimum ideas with a known outcome an
   * author needs before he can be allowed (fewer -> banned by default).
   */
  minAuthorTrack: number[];
  /**
   * Author ban rule to sweep: minimum hit rate (0..1) an author needs
   * to be allowed (worse -> banned).
   */
  minAuthorHitRate: number[];
  /**
   * Weighted consensus thresholds to sweep. An author's vote weight
   * is his Laplace-smoothed track record (hits+1)/(ideas+2) — a 2/2
   * newcomer weighs less than a 15/15 veteran. Entry requires the
   * SUM of weights of unique aligned unbanned authors in the rolling
   * window to reach the threshold. 0 disables the weighted gate
   * (binary minIdeasAligned counting only).
   */
  minWeightAligned: number[];
  /**
   * Profit lock levels to sweep, percent from entry; 0 disables.
   * When price TOUCHES +X% a fixed floor arms at that level and the
   * trade exits only on a PULLBACK to the floor — unlike a plain
   * fixed take, a runner keeps running and is later handled by the
   * trailing take (whose floor rises above the lock once the peak
   * clears it). Covers the zone where the trailing take is not armed
   * yet (peak below entry/(1 - r)) and profit would otherwise bleed
   * back to zero.
   */
  profitLockPercent: number[];
  /**
   * Author-hit metrics to sweep for the ban filter. The metric is a
   * rule parameter like the thresholds: "close" judges authors by
   * horizon close, "reach" by lock-reachability of their ideas.
   */
  authorMetric: SimulatorAuthorMetric[];
  /**
   * NOT a swept axis — run() aggregation config: ranking criteria
   * whose winners feed the run-level author artifact
   * (allowedAuthors = union of their whitelists, bannedAuthors =
   * banned by every one of them). A winner elected by a NON-FINITE
   * ranking value (Infinity sortino/recovery on a drawdown-free
   * curve — a grid-order representative of a tie class, not a
   * merit pick) never contributes to allowed: its authors join the
   * pool and stay banned by default. Backward compatibility knob:
   * ["sharpe"] makes the run-level lists exactly the Sharpe
   * winner's artifact — the pre-union behavior. Per-winner
   * artifacts in best[] are always complete regardless of this
   * list. test() does not use it — a frozen point carries its own
   * single rule.
   */
  banCriteria: SimulatorRankingCriterion[];
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
  /** Minimum unique aligned (unbanned) authors required to enter. */
  minIdeasAligned: number;
  /** Author ban rule: minimum known-outcome ideas to be allowed. */
  minAuthorTrack: number;
  /** Author ban rule: minimum hit rate (0..1) to be allowed. */
  minAuthorHitRate: number;
  /**
   * Weighted consensus threshold: required sum of Laplace-smoothed
   * track-record weights of aligned unbanned authors; 0 = disabled.
   */
  minWeightAligned: number;
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
 * the winning point, never a global of the run.
 */
export interface ISimulatorBest {
  /** The ranking criterion this winner belongs to. */
  criterion: SimulatorRankingCriterion;
  /** Winning point report; null when the grid produced no reports. */
  report: ISimulatorPointReport | null;
  /** Trades of the winning point (empty when report is null). */
  trades: ISimulatorTrade[];
  /**
   * Per-author track records under THIS winner's rule — the ONLY
   * source of the author artifact in a run result. Hits are counted
   * by the rule's metric (authorMetric + the lock/stop levels the
   * "reach" metric grades against), so even the raw numbers differ
   * between winners with different rules — a single run-level list
   * cannot represent them. Empty when report is null.
   */
  authorStats: ISimulatorAuthorStat[];
  /** Whitelist under THIS winner's ban rule. */
  allowedAuthors: string[];
  /** Ban list under THIS winner's ban rule. */
  bannedAuthors: string[];
}

/**
 * Final result of a simulation run: grid reports, four ranking
 * winners; the author artifact is per-winner in best[] — hits are
 * metric-dependent, a run-level list would lie to other criteria.
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
  /**
   * Authors allowed by AT LEAST ONE ranking winner's rule (union
   * over best[]). No criterion is privileged: with different rules
   * among winners this is the honest run-level whitelist candidate
   * set; which winner allows whom — in best[].allowedAuthors.
   */
  allowedAuthors: string[];
  /**
   * Authors banned by EVERY ranking winner's rule (complement of
   * allowedAuthors over all authors seen in the run). Banned here
   * means banned no matter which winner is taken to production.
   */
  bannedAuthors: string[];
  /** Mean holding time across all trades of every grid point, minutes. */
  avgHoldMinutes: number;
  /** 95th percentile of holding time across the whole grid, minutes. */
  p95HoldMinutes: number;
  /** 99th percentile of holding time across the whole grid, minutes — eternal holds are visible right in the run result. */
  p99HoldMinutes: number;
  /** All grid point reports, sorted by Sharpe descending. */
  reports: ISimulatorPointReport[];
  /** Winners of the rankings: sharpe, sortino, pnl, recovery. */
  best: ISimulatorBest[];
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
   * Ranking computed: reports sorted by the criterion (descending)
   * and the eligible winner (minimum-trades filter applied).
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
