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
}

/**
 * Why a simulated trade was closed.
 */
export type SimulatorExitReason =
  | "hard_stop"
  | "trailing_take"
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
  /** Number of correct ideas (horizon return in idea direction > 0). */
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
 * Ranking criterion for picking grid winners.
 */
export type SimulatorRankingCriterion = "sharpe" | "sortino" | "pnl";

/**
 * Winner of one ranking criterion with its trade list.
 */
export interface ISimulatorBest {
  /** The ranking criterion this winner belongs to. */
  criterion: SimulatorRankingCriterion;
  /** Winning point report; null when the grid produced no reports. */
  report: ISimulatorPointReport | null;
  /** Trades of the winning point (empty when report is null). */
  trades: ISimulatorTrade[];
}

/**
 * Final result of a simulation run: grid reports, three ranking
 * winners and the trained author filter artifact.
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
   * Per-author track records under the ban rule of the Sharpe
   * winner's grid point (raw ideas/hits/hitRate are rule-independent;
   * the banned flag follows the winning rule).
   */
  authorStats: ISimulatorAuthorStat[];
  /**
   * Logins of allowed authors — the production WHITELIST under the
   * Sharpe winner's ban rule. With default-ban semantics this is the
   * trained artifact to apply: in production only ideas of these
   * authors count.
   */
  allowedAuthors: string[];
  /** Logins of banned authors (complement of the whitelist). */
  bannedAuthors: string[];
  /** Mean holding time across all trades of every grid point, minutes. */
  avgHoldMinutes: number;
  /** 95th percentile of holding time across the whole grid, minutes. */
  p95HoldMinutes: number;
  /** 99th percentile of holding time across the whole grid, minutes — eternal holds are visible right in the run result. */
  p99HoldMinutes: number;
  /** All grid point reports, sorted by Sharpe descending. */
  reports: ISimulatorPointReport[];
  /** Winners of the three rankings: sharpe, sortino, pnl. */
  best: ISimulatorBest[];
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
}

/**
 * Unique simulator identifier.
 */
export type SimulatorName = string;
