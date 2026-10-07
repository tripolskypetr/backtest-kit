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
const METHOD_NAME_GET_WORKER_SYMBOL = "WorkerUtils.getWorkerSymbol";
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
 * Environment key carrying the symbol a forked worker child owns.
 *
 * Deliberately env, NOT argv: the entry script parses its own CLI
 * arguments, so the child receives the parent's argv untouched and
 * Worker.run reads the symbol itself. The key doubles as the worker flag:
 * its presence means the process IS a worker, which is what makes the
 * magic work — the child re-runs the same entry script, reaches the same
 * Worker.run calls, and instead of forking again starts its single symbol
 * inline.
 */
const WORKER_SYMBOL_KEY = "BACKTEST_KIT_WORKER";

/**
 * Environment key carrying the index of the owned symbol within the
 * symbolList of the Worker.run call that forked this child.
 *
 * Travels next to {@link WORKER_SYMBOL_KEY} and serves ordinal needs the
 * symbol itself cannot: staggered start delays, per-worker port or
 * account offsets. The index is per run() call — two calls each start
 * counting from zero.
 */
const WORKER_SYMBOL_INDEX = "BACKTEST_KIT_WORKER_INDEX";

/**
 * Type alias for a cleanup function returned by a background launch.
 *
 * Calling it stops the corresponding backtest or live instance, or kills
 * the corresponding forked child.
 */
type Dispose = (...args: any[]) => any;

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
 * Warms the candle cache for a backtest run: downloads and validates the
 * 1m candles of every traded symbol over the frame's historical window,
 * so the forked children never hit the exchange for data.
 *
 * Wrapped in singleshot: the warm-up runs ONCE per process, in the PARENT
 * before the first fork — every subsequent Worker.run call reuses the
 * first result instead of re-downloading. Children skip caching entirely:
 * all their work starts after the parent has the data on disk.
 *
 * @param symbolList - Symbols the worker is about to backtest
 * @param exchangeName - Exchange the candles are fetched from
 * @param frameName - Frame whose startDate/endDate bound the download
 */
const CACHE_CANDLES_FN = singleshot(
  async (
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
  },
);

/**
 * Child-side launch: starts the single owned symbol in THIS process.
 *
 * Mirrors the parent resolution flow — resolve the worker (explicit name
 * or the FIRST registered one), validate, fire onWaitForInit, wait for
 * the registries — then resolves strategy, exchange and, for backtest
 * mode, frame, and starts the symbol via Backtest.background or
 * Live.background (paper and live modes both run the live pipeline).
 *
 * No candle caching here: the PARENT warmed the cache once before
 * forking — all subsequent work happens inside the worker.
 *
 * @param symbol - The symbol this worker child owns
 * @param workerName - Worker to resolve; omit to take the first registered one
 * @returns Promise resolving to the dispose function stopping the instance
 * @throws Error when the worker or one of its dependencies cannot be resolved
 */
const RUN_SYMBOL_FN = async (symbol: string, workerName?: WorkerName) => {

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

  if (isBacktest) {
    const frameName = await GET_FRAME_NAME_FN(resolvedName, METHOD_NAME_RUN);
    const disposeFn = Backtest.background(symbol, {
      strategyName,
      exchangeName,
      frameName,
    });
    return () => disposeFn();
  }

  const disposeFn = Live.background(symbol, {
    strategyName,
    exchangeName,
  });
  return () => disposeFn();
}

/**
 * Parent-side launch: warms the candle cache and forks a dedicated worker
 * process per symbol.
 *
 * Mirrors the resolution flow up to the launch step — resolve the worker
 * (explicit name or the FIRST registered one), validate, fire
 * onWaitForInit, wait for the registries. For backtest mode it then warms
 * the 1m candle cache over the frame window via the singleshot
 * {@link CACHE_CANDLES_FN} (skip it with `cache: false` on the schema) —
 * the ONLY work the parent does; everything else happens inside the
 * workers. Finally forks the worker entry once per symbol: the child
 * receives its symbol via the environment (argv is passed through from
 * the parent untouched) and runs in its own working directory
 * `./job/<symbol>` (created lazily), so relative-path artifacts — logs,
 * dumps, persisted signals — never collide between symbols.
 *
 * The worker entry is resolved to an absolute path BEFORE forking: the
 * child's cwd is already `./job/<symbol>`, a relative modulePath would
 * resolve against the wrong directory.
 *
 * Children run with piped stdio: their stdout/stderr are streamed into
 * the root process's stdout/stderr (`end: false` keeps the parent streams
 * open when a child exits). A child exiting with a non-zero code is
 * reported to exitEmitter — the same fatal-error channel in-process
 * launches use.
 *
 * @param symbolList - Symbols to fork a worker for, one child process each
 * @param params - Worker options; omitted fields fall back to their defaults
 * @param params.workerPath - Path to the worker entry module; omit to fork the process's own entry script (resolved via {@link GET_WORKER_PATH_FN})
 * @param params.workerName - Worker to resolve; omit to take the first registered one
 * @returns Promise resolving to the composed dispose function killing every child
 * @throws Error when the worker or the worker entry cannot be resolved
 */
const RUN_FORK_FN = async (
  symbolList: string[],
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
    const isCache = !("cache" in workerSchema) || workerSchema.cache !== false;
    if (isCache) {
      const exchangeName = await GET_EXCHANGE_NAME_FN(
        resolvedName,
        METHOD_NAME_RUN,
      );
      const frameName = await GET_FRAME_NAME_FN(resolvedName, METHOD_NAME_RUN);
      await CACHE_CANDLES_FN(symbolList, exchangeName, frameName);
    }
  }

  const modulePath = workerPath
    ? resolve(workerPath)
    : GET_WORKER_PATH_FN(METHOD_NAME_RUN);
  const disposeList: Dispose[] = [];

  for (const [index, symbol] of symbolList.entries()) {
    const cwd = join(process.cwd(), "job", symbol);
    mkdirSync(cwd, { recursive: true });
    const child = fork(modulePath, process.argv.slice(2), {
      cwd,
      env: {
        ...process.env,
        [WORKER_SYMBOL_KEY]: symbol,
        [WORKER_SYMBOL_INDEX]: String(index),
      },
      silent: true,
    });
    child.stdout && child.stdout.pipe(process.stdout, { end: false });
    child.stderr && child.stderr.pipe(process.stderr, { end: false });
    child.on("exit", (code) => {
      if (code) {
        exitEmitter.next(
          new Error(
            `Worker child exited with code ${code} symbol=${symbol} workerName=${resolvedName}`,
          ),
        );
      }
    });
    disposeList.push(() => {
      if (!child.killed) {
        child.kill();
      }
    });
  }

  return compose(...disposeList);
}

/**
 * Entry point that shards a registered worker schema across child
 * processes, one symbol per process.
 *
 * A worker binds a run mode (backtest, paper or live) to optional
 * strategy, exchange and frame references; the symbol list is NOT part of
 * the schema — Worker.run receives it per call. The same entry script
 * serves both roles with NO branching in user code: in the parent run
 * forks a child per symbol, in a child the SAME run call recognizes its
 * owned symbol and starts it inline — calls whose symbol list does not
 * contain the owned symbol are no-ops there.
 */
export class WorkerUtils {
  /**
   * Runs every symbol of the list in its own forked worker process — or,
   * inside a worker child, starts the owned symbol in-process.
   *
   * Fire-and-forget: the method returns synchronously and resolves the
   * worker (explicit name or the FIRST registered one) in the background.
   * The magic is role detection, no branching needed in user code:
   *
   * - PARENT (no worker environment): for backtest mode warms the 1m
   *   candle cache over the frame window ONCE per process (singleshot,
   *   skip with `cache: false` on the schema) BEFORE the first fork, then
   *   forks the worker entry once per symbol. Each child gets its symbol
   *   via the environment (argv is passed through untouched) and its own
   *   working directory `./job/<symbol>` (created lazily). Children's
   *   stdout/stderr are piped into the root process; a non-zero exit is
   *   reported to exitEmitter. All work past the cache warm-up happens
   *   inside the workers.
   * - CHILD (forked by run): re-running the entry script reaches the same
   *   run calls; the call whose symbolList contains the owned symbol
   *   starts it inline via Backtest.background or Live.background (paper
   *   and live modes both run the live pipeline), every other call is a
   *   no-op. No candle caching here — the parent already warmed it.
   *
   * The worker entry resolves automatically: with workerPath omitted the
   * process's OWN entry script (process.argv[1], symlinks unwrapped) is
   * forked. Pass workerPath to use a dedicated entry module instead.
   *
   * Call it several times with different symbol arrays to shard a
   * portfolio across process pools — every call forks its own children
   * and returns its own dispose; a symbol should appear in only one call.
   *
   * Not available under the backtest-kit CLI: the method throws
   * synchronously when the CLI marker is set on globalThis — the CLI owns
   * the process tree and a forked entry would boot the CLI, not the
   * worker.
   *
   * A resolution failure is routed to exitEmitter. The returned dispose
   * is safe to call at any moment: invoked while the launch is still
   * initializing, it marks the run as stopped and the children (or the
   * inline instance) are disposed right after they start; invoked later,
   * it stops them immediately.
   *
   * @param symbolList - Symbols to run, one forked worker process each
   * @param params - Worker options; omitted fields fall back to their defaults
   * @param params.workerPath - Path to the worker entry module; omit to fork the process's own entry script
   * @param params.workerName - Worker to resolve; omit to take the first registered one
   * @returns Dispose function stopping everything this call started
   * @throws Error when running under the backtest-kit CLI
   *
   * @example
   * ```typescript
   * // main.ts — doubles as the worker entry, no branching needed
   * addWorkerSchema({
   *   workerName: "my-worker",
   *   live: true,
   * });
   *
   * Worker.run(["BTCUSDT", "ETHUSDT"]);
   * Worker.run(["BNBUSDT"]);
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

    const workerSymbol = this.getWorkerSymbol();

    if (workerSymbol && !symbolList.includes(workerSymbol)) {
      return () => {};
    }

    let isStopped = false;
    let disposeFn = () => {
      isStopped = true;
    };

    {
      const main = async () => {
        disposeFn = workerSymbol
          ? await RUN_SYMBOL_FN(workerSymbol, params.workerName)
          : await RUN_FORK_FN(symbolList, params);
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
   * Returns the symbol this worker child owns, or null in the parent.
   *
   * The symbol travels through the environment, NOT argv — the entry
   * script keeps full ownership of its own CLI arguments. Usually there
   * is no need to call this: {@link run} detects the role itself. Useful
   * for conditional setup around the run calls (logging, monitoring).
   *
   * @returns The owned symbol inside a worker child, null otherwise
   */
  public getWorkerSymbol = (): string | null => {
    backtest.loggerService.log(METHOD_NAME_GET_WORKER_SYMBOL);
    return process.env[WORKER_SYMBOL_KEY] || null;
  };

  /**
   * Returns the index of the owned symbol within the symbolList of the
   * Worker.run call that forked this child, or null in the parent.
   *
   * Travels next to {@link getWorkerSymbol} through the environment and
   * serves ordinal needs the symbol itself cannot: staggered start
   * delays, per-worker port or account offsets. The index is per run()
   * call — two calls each start counting from zero.
   *
   * @returns Zero-based index inside a worker child, null otherwise
   */
  public getWorkerIndex = (): number | null => {
    backtest.loggerService.log(METHOD_NAME_GET_WORKER_INDEX);
    const index = process.env[WORKER_SYMBOL_INDEX];
    return index ? Number(index) : null;
  };
}

/**
 * Singleton worker API: shards a registered worker schema across child
 * processes, one symbol per process, with automatic parent/child role
 * detection.
 */
export const Worker = new WorkerUtils();
