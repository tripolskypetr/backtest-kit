import backtest from "../lib";
import { Backtest } from "./Backtest";
import { Live } from "./Live";
import { cacheCandles } from "../function/cache";
import { waitForReady } from "../function/init";
import { IWorkerRunParams, WorkerName } from "../interfaces/Worker.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { compose, getErrorMessage, singleshot } from "functools-kit";
import { exitEmitter } from "../config/emitters";
import { fork } from "child_process";
import { mkdirSync, realpathSync } from "fs";
import { join, resolve } from "path";

const METHOD_NAME_RUN = "WorkerUtils.run";
const METHOD_NAME_GET_WORKER_SYMBOL_LIST = "WorkerUtils.getWorkerSymbolList";
const METHOD_NAME_GET_WORKER_INDEX = "WorkerUtils.getWorkerIndex";

/**
 * Global-registry symbol the CLI entry stamps onto globalThis.
 *
 * Symbol.for resolves to the SAME symbol from any module or bundle, so the
 * check works across package copies. When the flag is set the process was
 * started by the backtest-kit CLI and Worker.run must refuse to fork:
 * re-running process.argv[1] would boot the CLI itself, not the user script.
 */
const CLI_SYMBOL = Symbol.for("backtest-kit-cli");

/**
 * Environment key carrying the JSON-encoded symbol list a forked worker
 * child owns — one child runs the WHOLE symbolList of its Worker.run call.
 *
 * Deliberately env, NOT argv: the entry script parses its own CLI
 * arguments, so the child receives the parent's argv untouched. The key
 * doubles as the worker flag: its presence means the process IS a worker.
 */
const WORKER_SYMBOL_KEY = "BACKTEST_KIT_WORKER";

/**
 * Environment key carrying the ordinal of the Worker.run call that forked
 * this child.
 *
 * The matching key of the magic: run calls arrive synchronously from the
 * same barrel import in BOTH processes, so the Nth call in the parent is
 * the Nth call in the child. The child counts its own run calls and only
 * the call whose ordinal equals this value starts its symbols inline —
 * every other call is a no-op there.
 */
const WORKER_SYMBOL_INDEX = "BACKTEST_KIT_WORKER_INDEX";

/**
 * Type alias for a cleanup function returned by a background launch.
 *
 * Calling it stops the corresponding backtest or live instances, or kills
 * the corresponding forked child.
 */
type Dispose = (...args: any[]) => any;

/**
 * Ordinal counter of Worker.run calls in THIS process.
 *
 * Incremented synchronously at the top of every run call, BEFORE any
 * await — the barrel import calls run back to back, and only a
 * synchronous count preserves that order against async interleaving.
 * Parent and child run the same entry script, so the sequences match 1:1.
 */
let RUN_CALL_ORDINAL = 0;

/**
 * Global mutex over candle cache downloads, shared by every Worker.run
 * call in the process.
 *
 * Each backtest run APPENDS its download to this promise chain, so
 * downloads never overlap, and every fork phase waits for the chain to
 * drain completely via {@link WAIT_FOR_CACHE_FN} — NO child process is
 * spawned while any cache download, own or foreign, is still running.
 */
let CACHE_BARRIER: Promise<void> = Promise.resolve();

/**
 * Orphan protection of a worker child: exits the process when the parent
 * dies.
 *
 * fork() always opens an IPC channel between parent and child; when the
 * parent terminates — cleanly or by crash/kill — the channel closes and
 * the child receives "disconnect". Without this handler the child would
 * keep running headless (for a live worker that means unsupervised real
 * trading), because Node never kills children on parent death by itself.
 *
 * Exits with code 0: dying together with the parent is expected cleanup,
 * not a failure — and there is nobody left to read a non-zero code
 * anyway. Wrapped in singleshot so repeated run calls inside the child
 * attach the handler once.
 */
const EXIT_ORPHAN_FN = singleshot(() => {
  process.on("disconnect", () => {
    console.error("backtest-kit worker lost its parent process, exiting");
    process.exit(0);
  });
});

/**
 * Resolves the effective worker to run.
 *
 * An explicit workerName wins. Without it, the FIRST registered worker
 * is used implicitly — registration order decides, so a setup with a
 * single worker never needs to name it. Zero registered workers make the
 * implicit choice impossible.
 *
 * Deliberately NOT memoized: workers register over time, so the
 * resolution must see the current registry on every call.
 *
 * @param workerName - Explicit worker name, or undefined to take the first registered
 * @param source - Caller tag included in error messages
 * @returns Promise resolving to the effective worker name
 * @throws Error when no worker is named and none are registered
 */
const GET_WORKER_NAME_FN = async (
  workerName: WorkerName | undefined,
  source: string,
): Promise<WorkerName> => {
  if (workerName) {
    return workerName;
  }
  const workerList = await backtest.workerValidationService.list();
  if (!workerList.length) {
    throw new Error(
      `Worker Error: no workerName given and no workers are registered source=${source}`,
    );
  }
  const [{ workerName: resolvedName }] = workerList;
  return resolvedName;
};

/**
 * Resolves the effective strategy of a worker.
 *
 * The schema's explicit strategyName wins. Without it, the SINGLE registered
 * strategy is used implicitly — the resolved name goes through the same
 * dependency-chain validation as an explicit one. Zero registered strategies
 * or two and more make the implicit choice impossible: with several
 * strategies the schema MUST name one, ambiguity is an error, not a guess.
 *
 * @param workerName - Worker name whose schema drives the resolution
 * @param source - Caller tag included in error messages
 * @returns Promise resolving to the effective strategy name
 * @throws Error when no strategies are registered or the choice is ambiguous
 */
const GET_STRATEGY_NAME_FN = async (
  workerName: WorkerName,
  source: string,
): Promise<StrategyName> => {
  const { strategyName } = backtest.workerSchemaService.get(workerName);
  if (strategyName) {
    return strategyName;
  }
  const strategyList = await backtest.strategyValidationService.list();
  if (!strategyList.length) {
    throw new Error(
      `Worker Error: worker ${workerName} has no strategyName and no strategies are registered source=${source}`,
    );
  }
  if (strategyList.length > 1) {
    throw new Error(
      `Worker Error: worker ${workerName} must specify strategyName explicitly, ${strategyList.length} strategies are registered source=${source}`,
    );
  }
  const [{ strategyName: resolvedName }] = strategyList;
  backtest.strategyValidationService.validate(resolvedName, source);
  return resolvedName;
};

/**
 * Resolves the effective exchange of a worker.
 *
 * The schema's explicit exchangeName wins. Without it, the SINGLE registered
 * exchange is used implicitly. Zero registered exchanges or two and more
 * make the implicit choice impossible: with several exchanges the schema
 * MUST name one, ambiguity is an error, not a guess.
 *
 * @param workerName - Worker name whose schema drives the resolution
 * @param source - Caller tag included in error messages
 * @returns Promise resolving to the effective exchange name
 * @throws Error when no exchanges are registered or the choice is ambiguous
 */
const GET_EXCHANGE_NAME_FN = async (
  workerName: WorkerName,
  source: string,
): Promise<ExchangeName> => {
  const { exchangeName } = backtest.workerSchemaService.get(workerName);
  if (exchangeName) {
    return exchangeName;
  }
  const exchangeList = await backtest.exchangeValidationService.list();
  if (!exchangeList.length) {
    throw new Error(
      `Worker Error: worker ${workerName} has no exchangeName and no exchanges are registered source=${source}`,
    );
  }
  if (exchangeList.length > 1) {
    throw new Error(
      `Worker Error: worker ${workerName} must specify exchangeName explicitly, ${exchangeList.length} exchanges are registered source=${source}`,
    );
  }
  const [{ exchangeName: resolvedName }] = exchangeList;
  backtest.exchangeValidationService.validate(resolvedName, source);
  return resolvedName;
};

/**
 * Resolves the effective frame of a backtest worker.
 *
 * The schema's explicit frameName wins. Without it, the SINGLE registered
 * frame is used implicitly. Zero registered frames or two and more make the
 * implicit choice impossible: with several frames the schema MUST name one,
 * ambiguity is an error, not a guess. Only backtest workers reach this —
 * paper and live runs do not use frames.
 *
 * @param workerName - Worker name whose schema drives the resolution
 * @param source - Caller tag included in error messages
 * @returns Promise resolving to the effective frame name
 * @throws Error when no frames are registered or the choice is ambiguous
 */
const GET_FRAME_NAME_FN = async (
  workerName: WorkerName,
  source: string,
): Promise<FrameName> => {
  const workerSchema = backtest.workerSchemaService.get(workerName);
  if ("frameName" in workerSchema && workerSchema.frameName) {
    return workerSchema.frameName;
  }
  const frameList = await backtest.frameValidationService.list();
  if (!frameList.length) {
    throw new Error(
      `Worker Error: worker ${workerName} has no frameName and no frames are registered source=${source}`,
    );
  }
  if (frameList.length > 1) {
    throw new Error(
      `Worker Error: worker ${workerName} must specify frameName explicitly, ${frameList.length} frames are registered source=${source}`,
    );
  }
  const [{ frameName: resolvedName }] = frameList;
  backtest.frameValidationService.validate(resolvedName, source);
  return resolvedName;
};

/**
 * Resolves the worker entry module automatically from the running process.
 *
 * Takes process.argv[1] — the script Node was started with — and unwraps
 * symlinks via realpathSync, the same way the CLI's getEntry helper
 * identifies the entry module (bin shims and npm links point at the real
 * file). Empty argv[1] (REPL, eval) makes automatic resolution impossible:
 * pass workerPath explicitly there.
 *
 * @param source - Caller tag included in error messages
 * @returns Absolute real path of the entry script
 * @throws Error when the process has no entry script
 */
const GET_WORKER_PATH_FN = (source: string): string => {
  if (!process.argv[1]) {
    throw new Error(
      `Worker Error: cannot resolve the worker entry automatically (process.argv[1] is empty), pass workerPath explicitly source=${source}`,
    );
  }
  return realpathSync(process.argv[1]);
};

/**
 * Downloads and validates the 1m candles of every given symbol over the
 * frame's historical window, so the forked children never hit the
 * exchange for data.
 *
 * Never called directly from a run — downloads enter the global
 * {@link CACHE_BARRIER} chain via {@link ENQUEUE_CACHE_FN} so they are
 * mutually exclusive across Worker.run calls.
 *
 * @param symbolList - Symbols the worker is about to backtest
 * @param exchangeName - Exchange the candles are fetched from
 * @param frameName - Frame whose startDate/endDate bound the download
 */
const CACHE_CANDLES_FN = async (
  symbolList: string[],
  exchangeName: ExchangeName,
  frameName: FrameName,
) => {
  const { startDate, endDate } = backtest.frameSchemaService.get(frameName);
  for (const symbol of symbolList) {
    await cacheCandles({
      exchangeName,
      from: startDate,
      to: endDate,
      interval: "1m",
      symbol,
    });
  }
};

/**
 * Appends a candle cache download to the global {@link CACHE_BARRIER}
 * chain — the enter side of the mutex.
 *
 * Downloads queued by different Worker.run calls execute strictly one
 * after another, never in parallel, so the exchange rate limit and the
 * disk see a single writer at a time.
 *
 * @param symbolList - Symbols to download candles for
 * @param exchangeName - Exchange the candles are fetched from
 * @param frameName - Frame whose startDate/endDate bound the download
 */
const ENQUEUE_CACHE_FN = (
  symbolList: string[],
  exchangeName: ExchangeName,
  frameName: FrameName,
) => {
  CACHE_BARRIER = CACHE_BARRIER.then(() =>
    CACHE_CANDLES_FN(symbolList, exchangeName, frameName),
  );
};

/**
 * Blocks until the global {@link CACHE_BARRIER} chain is fully drained —
 * the wait side of the mutex.
 *
 * Re-checks the chain after every await: a download queued by ANOTHER
 * Worker.run call while this one was waiting extends the chain, and the
 * loop waits again — so when this resolves, NO cache download is pending
 * anywhere in the process and the children are safe to spawn against a
 * complete cache.
 */
const WAIT_FOR_CACHE_FN = async () => {
  let current: Promise<void>;
  do {
    current = CACHE_BARRIER;
    await current;
  } while (current !== CACHE_BARRIER);
};

/**
 * Child-side launch: starts EVERY owned symbol in THIS process.
 *
 * Mirrors the parent resolution flow — resolve the worker (explicit name
 * or the FIRST registered one), validate, fire onWaitForInit, wait for
 * the registries — then resolves strategy, exchange and, for backtest
 * mode, frame, and starts each symbol of the list via Backtest.background
 * or Live.background (paper and live modes both run the live pipeline).
 *
 * No candle caching here: the PARENT drained the cache mutex before
 * forking — all subsequent work happens inside the worker.
 *
 * @param symbolList - The symbols this worker child owns
 * @param workerName - Worker to resolve; omit to take the first registered one
 * @returns Promise resolving to the composed dispose function stopping every instance
 * @throws Error when the worker or one of its dependencies cannot be resolved
 */
const RUN_SYMBOLS_FN = async (
  symbolList: string[],
  workerName?: WorkerName,
) => {

  await waitForReady(false);

  const resolvedName = await GET_WORKER_NAME_FN(workerName, METHOD_NAME_RUN);

  backtest.workerValidationService.validate(resolvedName, METHOD_NAME_RUN);

  const workerSchema = backtest.workerSchemaService.get(resolvedName);

  const isBacktest = "backtest" in workerSchema && workerSchema.backtest;

  if (workerSchema.callbacks?.onWaitForInit) {
    await workerSchema.callbacks.onWaitForInit(resolvedName);
  }

  if (isBacktest) {
      await waitForReady(true);
  }

  const strategyName = await GET_STRATEGY_NAME_FN(
    resolvedName,
    METHOD_NAME_RUN,
  );
  const exchangeName = await GET_EXCHANGE_NAME_FN(
    resolvedName,
    METHOD_NAME_RUN,
  );

  const disposeList: Dispose[] = [];

  if (isBacktest) {
    const frameName = await GET_FRAME_NAME_FN(resolvedName, METHOD_NAME_RUN);
    for (const symbol of symbolList) {
      const disposeFn = Backtest.background(symbol, {
        strategyName,
        exchangeName,
        frameName,
      });
      disposeList.push(() => disposeFn());
    }
    return compose(...disposeList);
  }

  for (const symbol of symbolList) {
    const disposeFn = Live.background(symbol, {
      strategyName,
      exchangeName,
    });
    disposeList.push(() => disposeFn());
  }

  return compose(...disposeList);
}

/**
 * Parent-side launch: queues the candle cache download, waits for the
 * global cache mutex to drain and forks ONE worker process for the whole
 * symbol list of this Worker.run call.
 *
 * Mirrors the resolution flow up to the launch step — resolve the worker
 * (explicit name or the FIRST registered one), validate, fire
 * onWaitForInit, wait for the registries. For backtest mode it then
 * appends the 1m candle download over the frame window to the global
 * {@link CACHE_BARRIER} — ONLY when the schema opts in with
 * `cache: true`: the candle cache directory is cwd-relative, children
 * run in their own `./job` directories and would not see the parent's
 * files, so warming is off by default until the setup reads candles
 * from a cwd-independent source. EVERY fork — cached or not — waits
 * for the barrier to drain via
 * {@link WAIT_FOR_CACHE_FN}: no child process starts while any cache
 * download in the process is still running. The cache warm-up is the
 * ONLY work the parent does; everything else happens inside the worker.
 *
 * The single child receives the JSON-encoded symbol list and the ordinal
 * of this run call via the environment (argv is passed through from the
 * parent untouched) and runs in its own working directory
 * `./job/<symbols joined with "-">` (created lazily), so relative-path
 * artifacts — logs, dumps, persisted signals — never collide between
 * worker pools.
 *
 * The worker entry is resolved to an absolute path BEFORE forking: the
 * child's cwd is already inside `./job`, a relative modulePath would
 * resolve against the wrong directory.
 *
 * The child runs with piped stdio: its stdout/stderr are streamed into
 * the root process's stdout/stderr (`end: false` keeps the parent streams
 * open when a child exits). A child exiting with a non-zero code is
 * reported to exitEmitter — the same fatal-error channel in-process
 * launches use.
 *
 * @param symbolList - Symbols of this run call, all started in ONE child
 * @param callIndex - Ordinal of the Worker.run call, the child-matching key
 * @param params - Worker options; omitted fields fall back to their defaults
 * @param params.workerPath - Path to the worker entry module; omit to fork the process's own entry script (resolved via {@link GET_WORKER_PATH_FN})
 * @param params.workerName - Worker to resolve; omit to take the first registered one
 * @returns Promise resolving to the dispose function killing the child
 * @throws Error when the worker or the worker entry cannot be resolved
 */
const RUN_FORK_FN = async (
  symbolList: string[],
  callIndex: number,
  { workerPath, workerName }: Partial<IWorkerRunParams>,
) => {

  await waitForReady(false);

  const resolvedName = await GET_WORKER_NAME_FN(workerName, METHOD_NAME_RUN);

  backtest.workerValidationService.validate(resolvedName, METHOD_NAME_RUN);

  const workerSchema = backtest.workerSchemaService.get(resolvedName);

  const isBacktest = "backtest" in workerSchema && workerSchema.backtest;

  if (workerSchema.callbacks?.onWaitForInit) {
    await workerSchema.callbacks.onWaitForInit(resolvedName);
  }

  if (isBacktest) {
      await waitForReady(true);
  }

  if (isBacktest) {
    const isCache = "cache" in workerSchema && workerSchema.cache === true;
    if (isCache) {
      const exchangeName = await GET_EXCHANGE_NAME_FN(
        resolvedName,
        METHOD_NAME_RUN,
      );
      const frameName = await GET_FRAME_NAME_FN(resolvedName, METHOD_NAME_RUN);
      ENQUEUE_CACHE_FN(symbolList, exchangeName, frameName);
    }
  }

  await WAIT_FOR_CACHE_FN();

  const modulePath = workerPath
    ? resolve(workerPath)
    : GET_WORKER_PATH_FN(METHOD_NAME_RUN);

  const cwd = join(process.cwd(), "job", symbolList.join("-"));
  mkdirSync(cwd, { recursive: true });

  const child = fork(modulePath, process.argv.slice(2), {
    cwd,
    env: {
      ...process.env,
      [WORKER_SYMBOL_KEY]: JSON.stringify(symbolList),
      [WORKER_SYMBOL_INDEX]: String(callIndex),
    },
    silent: true,
  });
  child.stdout && child.stdout.pipe(process.stdout, { end: false });
  child.stderr && child.stderr.pipe(process.stderr, { end: false });
  child.on("exit", (code) => {
    if (code) {
      exitEmitter.next(
        new Error(
          `Worker child exited with code ${code} symbolList=[${symbolList}] workerName=${resolvedName}`,
        ),
      );
    }
  });

  return () => {
    if (!child.killed) {
      child.kill();
    }
  };
}

/**
 * Entry point that shards a registered worker schema across child
 * processes, one process per Worker.run call.
 *
 * A worker binds a run mode (backtest, paper or live) to optional
 * strategy, exchange and frame references; the symbol list is NOT part of
 * the schema — Worker.run receives it per call and the WHOLE list runs in
 * ONE forked child. The same entry script serves both roles with NO
 * branching in user code: run calls arrive synchronously from the same
 * barrel import in both processes, so the Nth call in the parent matches
 * the Nth call in the child — the parent forks, the matching child call
 * starts its symbols inline, every other child call is a no-op.
 */
export class WorkerUtils {
  /**
   * Runs the symbol list in its own forked worker process — or, inside
   * the matching worker child, starts those symbols in-process.
   *
   * Fire-and-forget: the method returns synchronously and resolves the
   * worker (explicit name or the FIRST registered one) in the background.
   * The call ordinal is taken synchronously, so back-to-back barrel calls
   * keep their order. The magic is role detection, no branching needed in
   * user code:
   *
   * - PARENT (no worker environment): for backtest mode appends the 1m
   *   candle cache download to the GLOBAL cache mutex (opt-in via
   *   `cache: true` on the schema, off by default), then waits until
   *   EVERY queued download in the process has finished — no child
   *   starts against a partial cache — and forks ONE child for the
   *   whole list. The child
   *   gets the symbol list and the call ordinal via the environment (argv
   *   is passed through untouched) and its own working directory
   *   `./job/<symbols joined with "-">` (created lazily). The child's
   *   stdout/stderr are piped into the root process; a non-zero exit is
   *   reported to exitEmitter. All work past the cache warm-up happens
   *   inside the worker.
   * - CHILD (forked by run): re-running the entry script replays the same
   *   run calls; the call whose ordinal matches the forked one starts its
   *   symbols inline via Backtest.background or Live.background (paper
   *   and live modes both run the live pipeline), every other call is a
   *   no-op. No candle caching here — the parent already drained it.
   *   The child kills itself when the parent dies: the IPC channel
   *   fork() opened closes and the "disconnect" handler exits the
   *   process, so no orphan keeps trading unsupervised.
   *
   * The worker entry resolves automatically: with workerPath omitted the
   * process's OWN entry script (process.argv[1], symlinks unwrapped) is
   * forked. Pass workerPath to use a dedicated entry module instead.
   *
   * Call it several times with different symbol arrays to shard a
   * portfolio across processes — every call forks its own child and
   * returns its own dispose; a symbol should appear in only one call.
   *
   * Not available under the backtest-kit CLI: the method throws
   * synchronously when the CLI marker is set on globalThis — the CLI owns
   * the process tree and a forked entry would boot the CLI, not the
   * worker.
   *
   * A resolution failure is routed to exitEmitter. The returned dispose
   * is safe to call at any moment: invoked while the launch is still
   * initializing, it marks the run as stopped and the child (or the
   * inline instances) are disposed right after they start; invoked later,
   * it stops them immediately.
   *
   * @param symbolList - Symbols of this call, all started in ONE forked worker process
   * @param params - Worker options; omitted fields fall back to their defaults
   * @param params.workerPath - Path to the worker entry module; omit to fork the process's own entry script
   * @param params.workerName - Worker to resolve; omit to take the first registered one
   * @returns Dispose function stopping everything this call started
   * @throws Error when running under the backtest-kit CLI or when symbolList is empty
   *
   * @example
   * ```typescript
   * // main.ts — doubles as the worker entry, no branching needed
   * addWorkerSchema({
   *   workerName: "my-worker",
   *   live: true,
   * });
   *
   * Worker.run(["BTCUSDT", "ETHUSDT"]); // child #0 runs both symbols
   * Worker.run(["BNBUSDT"]);            // child #1 runs the third
   * ```
   */
  public run = (
    symbolList: string[],
    params: Partial<IWorkerRunParams> = {},
  ) => {
    backtest.loggerService.info(METHOD_NAME_RUN, {
      symbolList,
      params,
    });

    if ((globalThis as any)[CLI_SYMBOL]) {
      throw new Error(
        `Worker.run is not supported in CLI mode: the CLI owns the process tree and cannot fork worker entries`,
      );
    }

    if (!symbolList.length) {
      throw new Error(`Worker.run received an empty symbolList`);
    }

    const callIndex = RUN_CALL_ORDINAL++;

    const workerIndex = this.getWorkerIndex();

    if (workerIndex !== null) {
      EXIT_ORPHAN_FN();
    }

    if (workerIndex !== null && workerIndex !== callIndex) {
      return () => {};
    }

    let isStopped = false;
    let disposeFn = () => {
      isStopped = true;
    };

    {
      const main = async () => {
        disposeFn = workerIndex !== null
          ? await RUN_SYMBOLS_FN(symbolList, params.workerName)
          : await RUN_FORK_FN(symbolList, callIndex, params);
        if (isStopped) {
          disposeFn();
        }
      }

      main().catch((error) =>
        exitEmitter.next(new Error(getErrorMessage(error))),
      );
    }

    return () => disposeFn();
  };

  /**
   * Returns the symbol list this worker child owns, or null in the parent.
   *
   * The list travels through the environment as JSON, NOT argv — the
   * entry script keeps full ownership of its own CLI arguments. Usually
   * there is no need to call this: {@link run} detects the role itself.
   * Useful for conditional setup around the run calls (logging,
   * monitoring).
   *
   * @returns The owned symbols inside a worker child, null otherwise
   */
  public getWorkerSymbolList = (): string[] | null => {
    backtest.loggerService.log(METHOD_NAME_GET_WORKER_SYMBOL_LIST);
    const symbolList = process.env[WORKER_SYMBOL_KEY];
    return symbolList ? JSON.parse(symbolList) : null;
  };

  /**
   * Returns the ordinal of the Worker.run call that forked this child,
   * or null in the parent.
   *
   * This is the child-matching key of the magic: the child counts its
   * own run calls and the call whose ordinal equals this value runs its
   * symbols inline. Also serves ordinal needs outside run: staggered
   * start delays, per-worker port or account offsets.
   *
   * @returns Zero-based run-call ordinal inside a worker child, null otherwise
   */
  public getWorkerIndex = (): number | null => {
    backtest.loggerService.log(METHOD_NAME_GET_WORKER_INDEX);
    const index = process.env[WORKER_SYMBOL_INDEX];
    return index ? Number(index) : null;
  };
}

/**
 * Singleton worker API: shards a registered worker schema across child
 * processes, one process per Worker.run call, with automatic parent/child
 * role detection and a global cache mutex — no child starts until every
 * queued candle download has finished.
 */
export const Worker = new WorkerUtils();
