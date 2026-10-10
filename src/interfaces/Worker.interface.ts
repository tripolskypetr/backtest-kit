import { ExchangeName } from "./Exchange.interface";
import { FrameName } from "./Frame.interface";
import { StrategyName } from "./Strategy.interface";

/**
 * Lifecycle callbacks of a worker instance (all optional).
 *
 * An omitted callback is simply never fired.
 */
export interface IWorkerCallbacks {
    /**
     * Fired before Worker.run blocks on waitForReady — the place to kick
     * off lazy schema registration (dynamic imports, remote config) so the
     * registries fill in while run waits for them.
     */
    onWaitForInit(workerName: WorkerName): void | Promise<void>;
}

/**
 * Base registration arguments shared by every worker run mode.
 *
 * A worker binds a run mode to optional strategy and exchange references;
 * the symbol list is NOT part of the schema — it is passed to Worker.run,
 * which forks ONE child process for the whole list. Everything left out is
 * resolved implicitly from the registries at run time — a setup with one
 * strategy and one exchange needs nothing but a name and a mode flag.
 */
export interface IWorkerArgs {
    /** Unique worker identifier for the schema registry */
    workerName: WorkerName;
    /** Strategy to run. Optional: defaults to the single registered strategy; ambiguous (2+ registered) requires it */
    strategyName?: StrategyName;
    /** Exchange to run on. Optional: defaults to the single registered exchange; ambiguous (2+ registered) requires it */
    exchangeName?: ExchangeName;
    /** Lifecycle callbacks (all optional) */
    callbacks?: Partial<IWorkerCallbacks>;
}

/**
 * Worker running every symbol through the backtest pipeline
 * (Backtest.background) over a historical frame window — all symbols of
 * one Worker.run call share a single child process.
 */
export interface IWorkerBacktestArgs extends IWorkerArgs {
    /** Discriminator for type-safe union: run the backtest pipeline */
    backtest: true;
    /** Timeframe bounding the run. Optional: defaults to the single registered frame; ambiguous (2+ registered) requires it */
    frameName?: FrameName;
    /** Warm the 1m candle cache over the frame window in the PARENT before forking (a manual docker-compose shard warms its own instead); downloads of all Worker.run calls are serialized by a global mutex and no child starts until every queued download completes. Default: GLOBAL_CONFIG.CC_WORKER_CANDLE_CACHE_DEFAULT (false — the cache directory is cwd-relative and children run in their own ./job directories, so enable only when candles are read from a cwd-independent source) */
    cache?: boolean;
}

/**
 * Worker running every symbol through the live pipeline
 * (Live.background) without placing real orders — all symbols of one
 * Worker.run call share a single child process.
 */
export interface IWorkerPaperArgs extends IWorkerArgs {
    /** Discriminator for type-safe union: run the live pipeline in paper mode */
    paper: true;
}

/**
 * Worker running every symbol through the live pipeline
 * (Live.background) with real trading — all symbols of one Worker.run
 * call share a single child process.
 */
export interface IWorkerLiveArgs extends IWorkerArgs {
    /** Discriminator for type-safe union: run the live pipeline */
    live: true;
}

/**
 * Options of WorkerUtils.run.
 *
 * Every field has an automatic fallback, so callers pass a Partial of
 * this interface — an empty object (or nothing) accepts every default.
 */
export interface IWorkerRunParams {
    /** Path to the worker entry module. Default: the process's own entry script (process.argv[1], symlinks unwrapped) */
    workerPath: string;
    /** Worker to resolve. Default: the first registered one */
    workerName: WorkerName;
}

/**
 * Registration schema of a worker instance.
 *
 * Discriminated union over the run mode: exactly one of the backtest,
 * paper or live flags picks the pipeline Worker.run starts in the forked
 * child process owning the whole symbol list of the call.
 * - workerName — registry key; duplicate registration is a validation error.
 * - strategyName / exchangeName / frameName — optional: when omitted, the
 *   SINGLE registered schema of that kind is used; with two or more
 *   registered the worker must name one explicitly — ambiguity is an
 *   error, not a guess.
 * - callbacks — all optional; an omitted callback is simply never fired.
 */
export type IWorkerSchema =
  | IWorkerBacktestArgs
  | IWorkerPaperArgs
  | IWorkerLiveArgs;

/**
 * Unique worker identifier.
 */
export type WorkerName = string;
