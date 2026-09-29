import { IPublicSignalRow } from "../interfaces/Strategy.interface";
import swarm, { ExecutionContextService, MethodContextService } from "../lib";

const LEVEL_METHOD_NAME_STATIC_MATCH = "Level._match";
const LEVEL_METHOD_NAME_STATIC_GET_VALUE = "Level._getValue";
const LEVEL_METHOD_NAME_MATCH = "Level.match";
const LEVEL_METHOD_NAME_GET_VALUE = "Level.getValue";

const MINUTE_MS = 60_000;

/**
 * Step-function lookup keyed by position age in minutes.
 *
 * Wraps a plain `Record<number, number | null>` dictionary where
 * the key is the minute the threshold starts to apply and the value is the
 * threshold itself (`null` marks a stage with no threshold). Object keys are
 * strings at runtime — they are cast back to numbers internally. Resolution
 * picks the value of the LARGEST key that is `<= age`; past the last key the
 * last value stays in effect indefinitely.
 *
 * Like {@link State}, the class is split into context-free statics and
 * context-bound instance methods: `Level._getValue(levelMap, dto)` receives
 * the full context as arguments, while instance `getValue()` takes no
 * arguments — it resolves the pending signal, mode and logical timestamp from
 * `backtest.executionContextService` / `backtest.methodContextService`, so it
 * is only available inside strategy lifecycle callbacks (e.g.
 * `listenActivePing`). Position age is measured from the signal's `pendingAt`
 * to the logical `when` of the current tick — never from wall-clock time.
 *
 * Primary use case — dynamic time stop: the loss tolerance (in % pnl) narrows
 * as the position ages, with thresholds derived from winner trajectories.
 *
 * @example
 * ```typescript
 * // Tolerance narrows with age: 4.5% at open, 1% after 24h.
 * // Keys are minutes — prefer computed keys `[hours * 60]` for readability.
 * const PNL_FLOOR_LEVEL = new Level({
 *   [0]: 4.5,
 *   [6 * 60]: 3.0,
 *   [12 * 60]: 2.0,
 *   [18 * 60]: 1.5,
 *   [24 * 60]: 1.0,
 * });
 *
 * listenActivePing(async ({ symbol, data, currentPrice }) => {
 *   const floor = await PNL_FLOOR_LEVEL.getValue();
 *   if (floor === null) {
 *     return;
 *   }
 *   const sign = data.position === "long" ? 1 : -1;
 *   const pnlPercent = ((currentPrice - data.priceOpen) / data.priceOpen) * 100 * sign;
 *   if (pnlPercent > -floor) {
 *     return;
 *   }
 *   await commitClosePending(symbol);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // `null` is valid syntax meaning the level is skipped: getValue() returns
 * // null for that stage, so the caller's `floor === null` guard bails out
 * // and no threshold applies. Here nothing is enforced during the first
 * // 10 hours (including the [3 * 60] stage), then 1.5% and 2.0% kick in.
 * const PNL_FLOOR_LEVEL = new Level({
 *   [3 * 60]: null,
 *   [10 * 60]: 1.5,
 *   [16 * 60]: 2.0,
 * });
 * ```
 */
export class Level {

  /**
   * @param levelMap - Plain object keyed by position age in minutes; the value
   *   of the largest key `<= age` is in effect, `null` disables the threshold
   *   for that stage
   */
  constructor(private readonly levelMap: Record<number, number | null>) { }

  /**
   * Context-free step-function resolution against an explicit age.
   * Object keys are cast from string to number before matching.
   * Returns the value of the largest key `<= dto.minutesActive` (which may
   * itself be `null`), or `null` when the age is below the smallest key
   * (or the dictionary is empty).
   * @param levelMap - Plain object keyed by position age in minutes
   * @param dto.minutesActive - Position age in minutes
   * @returns Matched value or null
   */
  public static _match = (levelMap: Record<number, number | null>, dto: { minutesActive: number }): number | null => {
    swarm.loggerService.debug(LEVEL_METHOD_NAME_STATIC_MATCH, {
      minutesActive: dto.minutesActive,
    });
    const entries = Object.entries(levelMap)
      .map(([minute, value]): [number, number | null] => [Number(minute), value])
      .sort(([a], [b]) => a - b);
    let result: number | null = null;
    for (const [minute, value] of entries) {
      if (dto.minutesActive < minute) {
        break;
      }
      result = value;
    }
    return result;
  };

  /**
   * Context-free resolution of the value for a signal's age.
   * Receives the full context as arguments — no execution context required.
   * Age is computed as `(when - pendingAt) / 1min` from the logical timestamp.
   * @param levelMap - Plain object keyed by position age in minutes
   * @param dto.pendingAt - Pending timestamp in milliseconds (when position became active)
   * @param dto.when - Logical timestamp at which the read is happening
   * @returns Matched value or null
   */
  public static _getValue = (levelMap: Record<number, number | null>, dto: { pendingAt: number, when: Date }): number | null => {
    swarm.loggerService.debug(LEVEL_METHOD_NAME_STATIC_GET_VALUE, {
      pendingAt: dto.pendingAt,
    });
    const minutesActive = (dto.when.getTime() - dto.pendingAt) / MINUTE_MS;
    return Level._match(levelMap, { minutesActive });
  };

  /**
   * Step-function resolution of this instance's dictionary against an explicit age.
   * @param minutesActive - Position age in minutes
   * @returns Matched value or null
   */
  public match = (minutesActive: number): number | null => {
    swarm.loggerService.info(LEVEL_METHOD_NAME_MATCH, { minutesActive });
    return Level._match(this.levelMap, { minutesActive });
  };

  /**
   * Resolve the value for the CURRENT pending signal's age.
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @returns Matched value, or `null` when there is no pending signal
   *   (position not open yet), no key `<= age`, or the matched stage is `null`
   * @throws Error if no execution/method context exists
   */
  public getValue = async (): Promise<number | null> => {
    swarm.loggerService.info(LEVEL_METHOD_NAME_GET_VALUE);
    if (!ExecutionContextService.hasContext()) {
      throw new Error("Level.getValue requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("Level.getValue requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    const pendingSignal: IPublicSignalRow = await swarm.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    );
    if (!pendingSignal) {
      return null;
    }
    return Level._getValue(this.levelMap, {
      pendingAt: pendingSignal.pendingAt,
      when,
    });
  };
}
