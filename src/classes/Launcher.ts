import backtest from "../lib";
import { Backtest } from "./Backtest";
import { Live } from "./Live";
import { cacheCandles } from "../function/cache";
import { waitForReady } from "../function/init";
import { LauncherName } from "../interfaces/Launcher.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { compose, getErrorMessage, singleshot, Subject } from "functools-kit";
import { exitEmitter } from "../config/emitters";
import { GLOBAL_CONFIG } from "../config/params";

const METHOD_NAME_RUN = "LauncherUtils.run";
const METHOD_NAME_LISTEN = "LauncherUtils.listen";

/**
 * Type alias for a generic function signature.
 *
 * Represents any function that takes any number of arguments and returns any type.
 */
type Function = (...args: any[]) => any | Promise<any>;

/**
 * Type alias for a cleanup function returned by a background launch.
 *
 * Calling it stops the corresponding backtest or live instance.
 */
type Dispose = (...args: any[]) => any;

/**
 * Subject for notifying listeners when the launcher is ready to run.
 *
 * Listeners can subscribe to this subject to be notified when the launcher
 * has completed its initialization and is ready to execute.
 */
const listenSubject = new Subject<void>();

/**
 * Resolves the effective launcher to run.
 *
 * An explicit launcherName wins. Without it, the FIRST registered launcher
 * is used implicitly — registration order decides, so a setup with a single
 * launcher never needs to name it. Zero registered launchers make the
 * implicit choice impossible.
 *
 * Deliberately NOT memoized: launchers register over time, so the
 * resolution must see the current registry on every call.
 *
 * @param launcherName - Explicit launcher name, or undefined to take the first registered
 * @param source - Caller tag included in error messages
 * @returns Promise resolving to the effective launcher name
 * @throws Error when no launcher is named and none are registered
 */
const GET_LAUNCHER_NAME_FN = async (
  launcherName: LauncherName | undefined,
  source: string,
): Promise<LauncherName> => {
  if (launcherName) {
    return launcherName;
  }
  const launcherList = await backtest.launcherValidationService.list();
  if (!launcherList.length) {
    throw new Error(
      `Launcher Error: no launcherName given and no launchers are registered source=${source}`,
    );
  }
  const [{ launcherName: resolvedName }] = launcherList;
  return resolvedName;
};

/**
 * Resolves the effective strategy of a launcher.
 *
 * The schema's explicit strategyName wins. Without it, the SINGLE registered
 * strategy is used implicitly — the resolved name goes through the same
 * dependency-chain validation as an explicit one. Zero registered strategies
 * or two and more make the implicit choice impossible: with several
 * strategies the schema MUST name one, ambiguity is an error, not a guess.
 *
 * @param launcherName - Launcher name whose schema drives the resolution
 * @param source - Caller tag included in error messages
 * @returns Promise resolving to the effective strategy name
 * @throws Error when no strategies are registered or the choice is ambiguous
 */
const GET_STRATEGY_NAME_FN = async (
  launcherName: LauncherName,
  source: string,
): Promise<StrategyName> => {
  const { strategyName } = backtest.launcherSchemaService.get(launcherName);
  if (strategyName) {
    return strategyName;
  }
  const strategyList = await backtest.strategyValidationService.list();
  if (!strategyList.length) {
    throw new Error(
      `Launcher Error: launcher ${launcherName} has no strategyName and no strategies are registered source=${source}`,
    );
  }
  if (strategyList.length > 1) {
    throw new Error(
      `Launcher Error: launcher ${launcherName} must specify strategyName explicitly, ${strategyList.length} strategies are registered source=${source}`,
    );
  }
  const [{ strategyName: resolvedName }] = strategyList;
  backtest.strategyValidationService.validate(resolvedName, source);
  return resolvedName;
};

/**
 * Resolves the effective exchange of a launcher.
 *
 * The schema's explicit exchangeName wins. Without it, the SINGLE registered
 * exchange is used implicitly. Zero registered exchanges or two and more
 * make the implicit choice impossible: with several exchanges the schema
 * MUST name one, ambiguity is an error, not a guess.
 *
 * @param launcherName - Launcher name whose schema drives the resolution
 * @param source - Caller tag included in error messages
 * @returns Promise resolving to the effective exchange name
 * @throws Error when no exchanges are registered or the choice is ambiguous
 */
const GET_EXCHANGE_NAME_FN = async (
  launcherName: LauncherName,
  source: string,
): Promise<ExchangeName> => {
  const { exchangeName } = backtest.launcherSchemaService.get(launcherName);
  if (exchangeName) {
    return exchangeName;
  }
  const exchangeList = await backtest.exchangeValidationService.list();
  if (!exchangeList.length) {
    throw new Error(
      `Launcher Error: launcher ${launcherName} has no exchangeName and no exchanges are registered source=${source}`,
    );
  }
  if (exchangeList.length > 1) {
    throw new Error(
      `Launcher Error: launcher ${launcherName} must specify exchangeName explicitly, ${exchangeList.length} exchanges are registered source=${source}`,
    );
  }
  const [{ exchangeName: resolvedName }] = exchangeList;
  backtest.exchangeValidationService.validate(resolvedName, source);
  return resolvedName;
};

/**
 * Resolves the effective frame of a backtest launcher.
 *
 * The schema's explicit frameName wins. Without it, the SINGLE registered
 * frame is used implicitly. Zero registered frames or two and more make the
 * implicit choice impossible: with several frames the schema MUST name one,
 * ambiguity is an error, not a guess. Only backtest launchers reach this —
 * paper and live runs do not use frames.
 *
 * @param launcherName - Launcher name whose schema drives the resolution
 * @param source - Caller tag included in error messages
 * @returns Promise resolving to the effective frame name
 * @throws Error when no frames are registered or the choice is ambiguous
 */
const GET_FRAME_NAME_FN = async (
  launcherName: LauncherName,
  source: string,
): Promise<FrameName> => {
  const launcherSchema = backtest.launcherSchemaService.get(launcherName);
  if ("frameName" in launcherSchema && launcherSchema.frameName) {
    return launcherSchema.frameName;
  }
  const frameList = await backtest.frameValidationService.list();
  if (!frameList.length) {
    throw new Error(
      `Launcher Error: launcher ${launcherName} has no frameName and no frames are registered source=${source}`,
    );
  }
  if (frameList.length > 1) {
    throw new Error(
      `Launcher Error: launcher ${launcherName} must specify frameName explicitly, ${frameList.length} frames are registered source=${source}`,
    );
  }
  const [{ frameName: resolvedName }] = frameList;
  backtest.frameValidationService.validate(resolvedName, source);
  return resolvedName;
};

/**
 * Warms the candle cache for a backtest run: downloads and validates the
 * 1m candles of every traded symbol over the frame's historical window,
 * so the backtest itself never hits the exchange for data.
 *
 * @param symbolList - Symbols the launcher is about to backtest
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
 * Resolves a launcher schema and starts its backtest or live instances.
 *
 * Notifies listen subscribers first (the place lazy schema registration
 * hooks in), waits for the registries to fill, resolves the launcher
 * (explicit name or the FIRST registered one) and its strategy, exchange
 * and — for backtest mode — frame, each falling back to the single
 * registered schema when the launcher omits it. Backtest runs warm the
 * 1m candle cache over the frame window unless the schema opts out with
 * `cache: false` (the default comes from
 * GLOBAL_CONFIG.CC_LAUNCHER_CANDLE_CACHE_DEFAULT), then every symbol of symbolList is launched in the
 * background; paper and live modes both run the live pipeline.
 *
 * Collects the dispose function of every started instance and composes
 * them into a single cleanup that stops the whole launch.
 *
 * @param launcherName - Launcher to run; omit to take the first registered one
 * @returns Promise resolving to the composed dispose function
 * @throws Error when the launcher or one of its dependencies cannot be resolved
 */
const RUN_FN = async (launcherName?: LauncherName) => {

  await listenSubject.next();
  await waitForReady(false);

  const resolvedName = await GET_LAUNCHER_NAME_FN(
    launcherName,
    METHOD_NAME_RUN,
  );

  backtest.launcherValidationService.validate(resolvedName, METHOD_NAME_RUN);

  const launcherSchema = backtest.launcherSchemaService.get(resolvedName);

  const isBacktest = "backtest" in launcherSchema && launcherSchema.backtest;

  if (launcherSchema.callbacks?.onWaitForInit) {
    await launcherSchema.callbacks.onWaitForInit(resolvedName);
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

  const { symbolList } = launcherSchema;
  const disposeList: Dispose[] = [];

  if (isBacktest) {
    const frameName = await GET_FRAME_NAME_FN(resolvedName, METHOD_NAME_RUN);
    const isCache =
      "cache" in launcherSchema && launcherSchema.cache !== undefined
        ? launcherSchema.cache
        : GLOBAL_CONFIG.CC_LAUNCHER_CANDLE_CACHE_DEFAULT;
    if (isCache) {
      await CACHE_CANDLES_FN(symbolList, exchangeName, frameName);
    }
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
 * Entry point that turns a registered launcher schema into running
 * backtest or live instances.
 *
 * A launcher binds a run mode (backtest, paper or live) to a symbol list
 * and optional strategy, exchange and frame references; everything left
 * out of the schema is resolved implicitly from the registries — a setup
 * with one strategy, one exchange and one frame needs nothing but the
 * symbol list and the mode flag.
 */
export class LauncherUtils {
  /**
   * Runs a registered launcher in the background and returns a dispose
   * function that stops every instance the launch started.
   *
   * Fire-and-forget: the method returns synchronously while {@link RUN_FN}
   * resolves the launcher (explicit name or the FIRST registered one), its
   * strategy, exchange and — for backtest mode — frame, warms the candle
   * cache (GLOBAL_CONFIG.CC_LAUNCHER_CANDLE_CACHE_DEFAULT; override per schema
   * with `cache`) and launches every
   * symbol of the schema's symbolList via Backtest.background or
   * Live.background (paper and live modes both run the live pipeline).
   * A resolution failure is routed to exitEmitter — the same fatal-error
   * channel the background launches themselves report through — so it
   * surfaces via listenExit instead of an unhandled rejection.
   *
   * The returned dispose is safe to call at any moment: invoked while the
   * launch is still initializing, it marks the run as stopped and the
   * instances are disposed right after they start; invoked later, it stops
   * them immediately.
   *
   * The optional onWaitForInit callback fires before run blocks on
   * waitForReady — the place to kick off lazy schema registration.
   *
   * @param launcherName - Launcher to run; omit to take the first registered one
   * @returns Dispose function stopping every started instance
   *
   * @example
   * ```typescript
   * addLauncherSchema({
   *   launcherName: "my-launcher",
   *   symbolList: ["BTCUSDT", "ETHUSDT"],
   *   backtest: true,
   * });
   *
   * const dispose = Launcher.run();
   * // ...later
   * dispose();
   * ```
   */
  public run = singleshot((launcherName?: LauncherName) => {
    backtest.loggerService.info(METHOD_NAME_RUN, {
      launcherName,
    });

    let isStopped = false;
    let disposeFn = () => {
      isStopped = true;
    };

    {
      const main = async () => {
        disposeFn = await RUN_FN(launcherName);
        if (isStopped) {
          disposeFn();
        }
      }

      main().catch((error) =>
        exitEmitter.next(new Error(getErrorMessage(error))),
      );
    }

    return () => {
      disposeFn && disposeFn();
      this.run.clear();
    }
  });

  /**
   * Subscribes a listener function to be notified when the launcher is scheduled for run.
   *
   * Support asynchronous callback or a Promise-returning function. The listener is called
   * once when the launcher is ready to run, allowing for lazy schema registration or other
   * promise-based initialization tasks before the actual run.
   * 
   * @param fn - Listener function to be called when the launcher is ready
   * @returns Subscription object that can be used to unsubscribe
   */
  public listen = (fn: Function) => {
    backtest.loggerService.info(METHOD_NAME_LISTEN);
    return listenSubject.subscribe(fn);
  }
}

/**
 * Singleton launcher API: resolves a registered launcher schema and starts
 * its backtest or live instances in the background.
 */
export const Launcher = new LauncherUtils();
