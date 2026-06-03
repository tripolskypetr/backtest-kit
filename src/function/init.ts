import { sleep } from "functools-kit";
import lib from "../lib";
import { entrySubject } from "../config/emitters";

const WAIT_FOR_READY_METHOD_NAME = "init.waitForReady";

const MAX_WAIT_SECONDS = 45;
const SECOND_DELAY = 1_000;

const TIMEOUT_SYMBOL = Symbol('timeout');

/**
 * Blocks until the schema registries needed to start trading are populated.
 *
 * Polls `exchangeValidationService`, `frameValidationService` and
 * `strategyValidationService` once per second for up to `MAX_WAIT_SECONDS`
 * seconds. The loop exits as soon as the required registries are non-empty
 * for the given mode:
 *
 * - Backtest mode (`isBacktest = true`): exchange, frame and strategy schemas
 *   must all be registered (frames define the historical window).
 * - Live mode (`isBacktest = false`): only exchange and strategy schemas are
 *   required — frames are unused.
 *
 * Useful at startup when schemas are registered asynchronously (lazy imports,
 * remote config, plugin loading) and the caller wants to delay `Backtest`/
 * `Live` invocation until everything is ready. If the timeout elapses without
 * the registries filling in, the function returns silently — the caller is
 * expected to surface a clearer error from the subsequent `Backtest`/`Live`
 * call (e.g. "no strategy registered").
 *
 * @param isBacktest - Whether to additionally require a registered frame schema. Defaults to `true`.
 * @returns Promise that resolves when the registries are ready or the timeout elapses.
 *
 * @example
 * ```typescript
 * import { waitForReady, Backtest } from "backtest-kit";
 *
 * import "./schemas/exchange";
 * import "./schemas/strategy";
 * import "./schemas/frame";
 *
 * await waitForReady();
 * Backtest.background("BTCUSDT", { strategyName, exchangeName, frameName });
 * ```
 */
export async function waitForReady(isBacktest = true) {
  lib.loggerService.info(WAIT_FOR_READY_METHOD_NAME, { isBacktest });
  if (entrySubject.data) {
    return;
  }
  if (entrySubject.hasListeners) {
    lib.loggerService.debug(`${WAIT_FOR_READY_METHOD_NAME} waiting for entrySubject`);
    const result = await Promise.race([
      entrySubject.toPromise(),
      sleep(MAX_WAIT_SECONDS * SECOND_DELAY).then(() => TIMEOUT_SYMBOL)
    ])
    typeof result === "symbol" && console.log("waitForReady timeout");
    return;
  }
  for (let i = 0; i !== MAX_WAIT_SECONDS; i++) {
    const [exchangeList, frameList, strategyList] = await Promise.all([
      lib.exchangeValidationService.list(),
      lib.frameValidationService.list(),
      lib.strategyValidationService.list(),
    ]);
    if (isBacktest && !frameList.length) {
      lib.loggerService.debug(WAIT_FOR_READY_METHOD_NAME, {
        reason: "no frames registered",
        attempt: i + 1,
      });
      await sleep(SECOND_DELAY);
      continue;
    }
    if (!exchangeList.length) {
      lib.loggerService.debug(WAIT_FOR_READY_METHOD_NAME, {
        reason: "no exchanges registered",
        attempt: i + 1,
      });
      await sleep(SECOND_DELAY);
      continue;
    }
    if (!strategyList.length) {
      lib.loggerService.debug(WAIT_FOR_READY_METHOD_NAME, {
        reason: "no strategies registered",
        attempt: i + 1,
      });
      await sleep(SECOND_DELAY);
      continue;
    }
    if (i === MAX_WAIT_SECONDS - 1) {
      console.log("waitForReady timeout");
    }
    break;
  }
}
