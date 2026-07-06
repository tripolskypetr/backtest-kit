import {
  singleshot,
  getErrorMessage,
  isObject,
  trycatch,
  errorData,
} from "functools-kit";
import {
  IRisk,
  IRiskParams,
  IRiskCheckArgs,
  IRiskCheckOptions,
  IRiskValidationPayload,
  IRiskActivePosition,
  IRiskRejectionResult,
  RiskRejection,
  IRiskValidationFn,
  RiskName,
} from "../interfaces/Risk.interface";
import { PersistRiskAdapter } from "../classes/Persist";
import { validationSubject, errorEmitter } from "../config/emitters";
import { get } from "../utils/get";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { IRiskSignalRow, ISignalRow, IStrategyPnL, StrategyName } from "../interfaces/Strategy.interface";
import { GLOBAL_CONFIG } from "../config/params";
import toProfitLossDto from "../helpers/toProfitLossDto";
import { getTotalClosed } from "../helpers/getTotalClosed";
import { Lock } from "../classes/Lock";

/** Used to prevent race confition between concurent strategies */
const RISK_LOCK = new Lock();

/** Type for active position map */
type RiskMap = Map<string, IRiskActivePosition>;

/** Symbol indicating that positions need to be fetched from persistence */
const POSITION_NEED_FETCH = Symbol("risk-need-fetch");

/** Zero PNL constant for scheduled signals (which don't have priceOpen or PNL yet) */
const ZERO_PNL: IStrategyPnL = { pnlPercentage: 0, priceOpen: 0, priceClose: 0, pnlCost: 0, pnlEntries: 0 };

/**
 * Converts signal to risk validation format.
 *
 * This function is used BEFORE position opens during risk checks.
 * It ensures all required fields are present for risk validation:
 *
 * - Falls back to currentPrice if priceOpen is not set (for ISignalDto/scheduled signals)
 * - Replaces priceStopLoss with trailing SL if active (for positions with trailing stops)
 * - Replaces priceTakeProfit with trailing TP if active (for positions with trailing take-profit)
 * - Preserves original stop-loss in originalPriceStopLoss for reference
 * - Preserves original take-profit in originalPriceTakeProfit for reference
 *
 * Use cases:
 * - Risk validation before opening a position (checkSignal)
 * - Pre-flight validation of scheduled signals
 * - Calculating position size based on stop-loss distance
 * - Calculating risk-reward ratio using effective SL/TP
 *
 * @param signal - Signal DTO or row (may not have priceOpen for scheduled signals)
 * @param currentPrice - Current market price, used as fallback for priceOpen if not set
 * @returns Signal in IRiskSignalRow format with guaranteed priceOpen and effective SL/TP
 *
 * @example
 * ```typescript
 * // For scheduled signal without priceOpen
 * const riskSignal = TO_RISK_SIGNAL(scheduledSignal, 45000);
 * // riskSignal.priceOpen = 45000 (fallback to currentPrice)
 *
 * // For signal with trailing SL/TP
 * const riskSignal = TO_RISK_SIGNAL(activeSignal, 46000);
 * // riskSignal.priceStopLoss = activeSignal._trailingPriceStopLoss (effective)
 * // riskSignal.priceTakeProfit = activeSignal._trailingPriceTakeProfit (effective)
 * // riskSignal.originalPriceStopLoss = activeSignal.priceStopLoss (original)
 * // riskSignal.originalPriceTakeProfit = activeSignal.priceTakeProfit (original)
 * ```
 */
const TO_RISK_SIGNAL = <T extends ISignalRow>(signal: T, currentPrice: number, timestamp: number): IRiskSignalRow => {
  const hasTrailingSL = "_trailingPriceStopLoss" in signal && signal._trailingPriceStopLoss !== undefined;
  const hasTrailingTP = "_trailingPriceTakeProfit" in signal && signal._trailingPriceTakeProfit !== undefined;
  const partialExecuted = ("_partial" in signal && Array.isArray(signal._partial))
    ? getTotalClosed(signal).totalClosedPercent
    : 0;
  // A market-open candidate (ISignalDto without priceOpen) opens at currentPrice —
  // apply the same fallback BEFORE computing pnl, otherwise pnl.pnlPercentage is
  // NaN and every numeric comparison in user risk validations silently passes.
  const pnlSignal = signal.priceOpen === undefined
    ? { ...signal, priceOpen: currentPrice }
    : signal;
  const pnl = signal._isScheduled ? ZERO_PNL : toProfitLossDto(pnlSignal, currentPrice);
  const maxDrawdown = signal._isScheduled ? ZERO_PNL : pnl;
  const peakProfit = signal._isScheduled ? ZERO_PNL : pnl;
  return {
    ...structuredClone(signal) as ISignalRow,
    cost: signal.cost || GLOBAL_CONFIG.CC_POSITION_ENTRY_COST,
    timestamp: signal.timestamp ?? timestamp,
    totalEntries: 1,
    totalPartials: 0,
    priceOpen: signal.priceOpen ?? currentPrice,
    priceStopLoss: hasTrailingSL ? signal._trailingPriceStopLoss : signal.priceStopLoss,
    priceTakeProfit: hasTrailingTP ? signal._trailingPriceTakeProfit : signal.priceTakeProfit,
    originalPriceStopLoss: signal.priceStopLoss,
    originalPriceTakeProfit: signal.priceTakeProfit,
    originalPriceOpen: signal.priceOpen ?? currentPrice,
    partialExecuted,
    pnl,
    maxDrawdown,
    peakProfit,
  };
};

/** Key generator for active position map */
const CREATE_NAME_FN = (strategyName: StrategyName, exchangeName: ExchangeName, symbol: string) =>
  `${strategyName}_${exchangeName}_${symbol}` as const;

/** Wrapper to execute risk validation function with error handling */
const DO_VALIDATION_FN = async (
  self: ClientRisk,
  validation: IRiskValidationFn,
  params: IRiskValidationPayload
): Promise<RiskRejection> => {
  try {
    return await validation(params);
  } catch (error) {
    const message = "ClientRisk exception thrown";
    const payload = {
      error: errorData(error),
      message: getErrorMessage(error),
    };
    self.params.logger.warn(message, payload);
    console.warn(message, payload);
    validationSubject.next(error);
    return payload.message;
  }
};

/** Wrapper to call onRejected callback with error handling */
const CALL_REJECTED_CALLBACKS_FN = trycatch(
  async (
    self: ClientRisk,
    symbol: string,
    params: IRiskCheckArgs
  ): Promise<void> => {
    if (self.params.callbacks?.onRejected) {
      await self.params.callbacks.onRejected(symbol, params);
    }
  },
  {
    fallback: (error, self) => {
      const message = "ClientRisk CALL_REJECTED_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/** Wrapper to call onAllowed callback with error handling */
const CALL_ALLOWED_CALLBACKS_FN = trycatch(
  async (
    self: ClientRisk,
    symbol: string,
    params: IRiskCheckArgs
  ): Promise<void> => {
    if (self.params.callbacks?.onAllowed) {
      await self.params.callbacks.onAllowed(symbol, params);
    }
  },
  {
    fallback: (error, self) => {
      const message = "ClientRisk CALL_ALLOWED_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Initializes active positions by reading from persistence.
 * Uses singleshot pattern to ensure it only runs once.
 * This function is exported for use in tests or other modules.
 *
 * In backtest mode, initializes with empty Map. In live mode, reads from persist storage.
 */
export const WAIT_FOR_INIT_FN = async (when: Date, self: ClientRisk): Promise<void> => {
  self.params.logger.debug("ClientRisk waitForInit", {
    backtest: self.params.backtest,
  });

  if (self.params.backtest) {
    self._activePositions = new Map();
    return;
  }

  const persistedPositions = await PersistRiskAdapter.readPositionData(
    self.params.riskName,
    self.params.exchangeName,
    when,
  );
  // JSON serializes Infinity as null, so an eternal-hold position
  // (minuteEstimatedTime: Infinity) reads back as null. Restore it so cross-strategy
  // risk checks see the original lifetime (guards custom persist adapters too).
  for (const [, position] of persistedPositions) {
    if (position && position.minuteEstimatedTime == null) {
      position.minuteEstimatedTime = Infinity;
    }
  }
  // Prune expired slots (crash artifacts). removeSignal is the ONLY delete in
  // this map: a slot whose lifetime has fully elapsed belongs to a position that
  // either already closed (its removeSignal write did not survive a crash) or is
  // about to time-expire on the very next tick — keeping it would block the
  // shared concurrency limit forever. Infinity-hold slots never expire here.
  const nowMs = when.getTime();
  const alivePositions = persistedPositions.filter(([, position]) =>
    position && nowMs < position.openTimestamp + position.minuteEstimatedTime * 60_000
  );
  if (alivePositions.length !== persistedPositions.length) {
    self.params.logger.warn("ClientRisk waitForInit: pruned expired position slots (stale crash artifacts)", {
      riskName: self.params.riskName,
      prunedCount: persistedPositions.length - alivePositions.length,
    });
  }
  self._activePositions = new Map(alivePositions);
};

/**
 * ClientRisk implementation for portfolio-level risk management.
 *
 * Provides risk checking logic to prevent signals that violate configured limits:
 * - Maximum concurrent positions (tracks across all strategies)
 * - Custom validations with access to all active positions
 *
 * Multiple ClientStrategy instances share the same ClientRisk instance,
 * allowing cross-strategy risk analysis.
 *
 * Used internally by strategy execution to validate signals before opening positions.
 */
export class ClientRisk implements IRisk {
  /**
   * Map of active positions tracked across all strategies.
   * Key: `${strategyName}_${exchangeName}_${symbol}` (see CREATE_NAME_FN)
   * Starts as POSITION_NEED_FETCH symbol, gets initialized on first use.
   */
  _activePositions: RiskMap | typeof POSITION_NEED_FETCH = POSITION_NEED_FETCH;

  /**
   * Keys of transient reservation placeholders (checkSignalAndReserve) still
   * awaiting their finalizing addSignal / releasing removeSignal. Excluded from
   * persisted snapshots in _updatePositions: a reservation is process-transient,
   * but a CONCURRENT strategy's addSignal persists the whole shared map — flushed
   * to disk that placeholder would survive a crash as a phantom position and
   * block the shared concurrency limit for the whole signal lifetime (forever
   * for minuteEstimatedTime: Infinity, which the expiry pruning never removes).
   */
  _reservedKeys = new Set<string>();

  constructor(readonly params: IRiskParams) {}

  /**
   * Initializes active positions by loading from persistence.
   * Uses singleshot pattern to ensure initialization happens exactly once.
   * Skips persistence in backtest mode.
   */
  private waitForInit = singleshot(async (when: Date) => await WAIT_FOR_INIT_FN(when, this));

  /**
   * Persists current active positions to disk.
   * Skips in backtest mode.
   */
  private async _updatePositions(when: Date): Promise<void> {
    if (this.params.backtest) {
      return;
    }

    if (this._activePositions === POSITION_NEED_FETCH) {
      await this.waitForInit(when);
    }

    // Reservation placeholders stay in-memory only (see _reservedKeys)
    await PersistRiskAdapter.writePositionData(
      Array.from(<RiskMap>this._activePositions).filter(
        ([key]) => !this._reservedKeys.has(key),
      ),
      this.params.riskName,
      this.params.exchangeName,
      when,
    );
  }

  /**
   * Registers a new opened signal.
   * Called by StrategyConnectionService after signal is opened.
   */
  public async addSignal(
    symbol: string,
    context: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName },
    positionData: {
      position: "long" | "short";
      priceOpen: number;
      priceStopLoss: number;
      priceTakeProfit: number;
      minuteEstimatedTime: number;
      openTimestamp: number;
    }
  ) {
    this.params.logger.debug("ClientRisk addSignal", {
      symbol,
      context,
      positionData,
      backtest: this.params.backtest,
    });

    await RISK_LOCK.acquireLock();
    try {
      const timestamp = await this.params.time.getTimestamp(
        symbol,
        context,
        this.params.backtest,
      );

      if (this._activePositions === POSITION_NEED_FETCH) {
        await this.waitForInit(new Date(timestamp));
      }

      const key = CREATE_NAME_FN(context.strategyName, context.exchangeName, symbol);
      const riskMap = <RiskMap>this._activePositions;
      riskMap.set(key, {
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
        symbol,
        position: positionData.position,
        priceOpen: positionData.priceOpen,
        priceStopLoss: positionData.priceStopLoss,
        priceTakeProfit: positionData.priceTakeProfit,
        minuteEstimatedTime: positionData.minuteEstimatedTime,
        openTimestamp: positionData.openTimestamp,
      });
      // The placeholder (if any) is finalized into a real position — persist it
      this._reservedKeys.delete(key);

      await this._updatePositions(new Date(timestamp));
    } finally {
      await RISK_LOCK.releaseLock();
    }
  }

  /**
   * Removes a closed signal.
   * Called by StrategyConnectionService when signal is closed.
   */
  public async removeSignal(
    symbol: string,
    context: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: string }
  ) {
    this.params.logger.debug("ClientRisk removeSignal", {
      symbol,
      context,
      backtest: this.params.backtest,
    });

    await RISK_LOCK.acquireLock();
    try {

      const timestamp = await this.params.time.getTimestamp(
        symbol,
        context,
        this.params.backtest,
      );

      if (this._activePositions === POSITION_NEED_FETCH) {
        await this.waitForInit(new Date(timestamp));
      }

      const key = CREATE_NAME_FN(context.strategyName, context.exchangeName, symbol);
      const riskMap = <RiskMap>this._activePositions;
      riskMap.delete(key);
      this._reservedKeys.delete(key);

      await this._updatePositions(new Date(timestamp));
    } finally {
      await RISK_LOCK.releaseLock();
    }
  }

  /**
   * Checks if a signal should be allowed based on risk limits.
   *
   * Executes custom validations with access to:
   * - Passthrough params from ClientStrategy (symbol, strategyName, exchangeName, currentPrice, timestamp)
   * - Active positions via this.activePositions getter
   *
   * Returns false immediately if any validation throws error.
   * Triggers callbacks (onRejected, onAllowed) based on result.
   *
   * @param params - Risk check arguments (passthrough from ClientStrategy)
   * @returns Promise resolving to true if allowed, false if rejected
   */
  public checkSignal = async (params: IRiskCheckArgs, options: Partial<IRiskCheckOptions> = {}): Promise<boolean> => {
    this.params.logger.debug("ClientRisk checkSignal", {
      symbol: params.symbol,
      strategyName: params.strategyName,
      backtest: this.params.backtest,
    });

    await RISK_LOCK.acquireLock();
    try {
      const timestamp = await this.params.time.getTimestamp(
        params.symbol,
        {
          strategyName: params.strategyName,
          exchangeName: params.exchangeName,
          frameName: params.frameName,
        },
        this.params.backtest
      );


      if (this._activePositions === POSITION_NEED_FETCH) {
        await this.waitForInit(new Date(timestamp));
      }

      const riskMap = <RiskMap>this._activePositions;

      const payload: IRiskValidationPayload = {
        ...params,
        currentSignal: TO_RISK_SIGNAL(
          params.currentSignal,
          params.currentPrice,
          timestamp,
        ),
        activePositionCount: riskMap.size,
        activePositions: Array.from(riskMap.values()),
      };

      let rejectionResult: IRiskRejectionResult | null = null;

      if (this.params.validations) {
        for (const validation of this.params.validations) {
          const rejection = await DO_VALIDATION_FN(
            this,
            typeof validation === "function" ? validation : validation.validate,
            payload
          );

          if (!rejection) {
            continue;
          }

          if (typeof rejection === "string") {
            rejectionResult = {
              id: null,
              note: rejection
                ? rejection
                : "note" in validation
                ? validation.note
                : "Validation failed",
            };
            break;
          }

          if (isObject(rejection)) {
            rejectionResult = {
              id: get(rejection, "id") || null,
              note: get(rejection, "note") || "Validation rejected the signal",
            };
            break;
          }
        }
      }

      if (rejectionResult) {
        // Call params.onRejected for riskSubject emission.
        // Use the time-service timestamp — the same clock the rest of this
        // critical section runs on (TO_RISK_SIGNAL, waitForInit, reservation),
        // not the caller-supplied params.timestamp.
        await this.params.onRejected(
          params.symbol,
          params,
          riskMap.size,
          rejectionResult,
          timestamp,
          this.params.backtest
        );

        // Call schema callbacks.onRejected if defined
        await CALL_REJECTED_CALLBACKS_FN(this, params.symbol, params);

        return false;
      }

      // Optional placeholder reservation: when caller plans to addSignal next,
      // pre-write into riskMap inside the same critical section so concurrent
      // checkSignal calls observe the incremented size before addSignal lands.
      // The placeholder shares the same key as the future addSignal — it will
      // be overwritten with real position data, not duplicated.
      if (options?.reserve) {
        const reserveKey = CREATE_NAME_FN(
          params.strategyName,
          params.exchangeName,
          params.symbol,
        );
        const signal = params.currentSignal;
        riskMap.set(reserveKey, {
          strategyName: params.strategyName,
          exchangeName: params.exchangeName,
          frameName: params.frameName,
          symbol: params.symbol,
          position: signal.position,
          priceOpen: signal.priceOpen ?? params.currentPrice,
          priceStopLoss: signal.priceStopLoss,
          priceTakeProfit: signal.priceTakeProfit,
          // The DTO is risk-checked BEFORE GET_SIGNAL_FN applies row defaults, so
          // apply the same lifetime default here — an undefined placeholder value
          // poisons expiry math (openTimestamp + undefined * 60_000 = NaN) in
          // concurrent validations reading activePositions.
          minuteEstimatedTime: signal.minuteEstimatedTime ?? GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES,
          openTimestamp: timestamp,
        });
        // Transient placeholder: visible to concurrent checks, but kept out of
        // persisted snapshots until addSignal finalizes it (see _reservedKeys)
        this._reservedKeys.add(reserveKey);
      }

      // All checks passed
      await CALL_ALLOWED_CALLBACKS_FN(this, params.symbol, params);

      return true;
    } finally {
      await RISK_LOCK.releaseLock();
    }
  };

  /**
   * Concurrency-safe variant of {@link checkSignal}: validates the signal AND
   * reserves a placeholder slot in the active position map atomically.
   *
   * **Why this exists.** `checkSignal` followed later by `addSignal` is not
   * atomic — between the two calls the caller does signal setup work that
   * yields to the event loop (sync-open callback, persist writes, etc.). When
   * several strategies sharing the same risk profile run in parallel, all of
   * them can pass `checkSignal` while the active position map is still empty,
   * then each call `addSignal` and blow past the limit. Reserving inside the
   * lock guarantees the next concurrent caller observes the incremented size
   * before its own validation runs.
   *
   * The reservation uses the same map key as the eventual `addSignal` call
   * (`strategyName + exchangeName + symbol`), so `addSignal` overwrites the
   * placeholder rather than appending a duplicate.
   *
   * Callers MUST ensure that every successful return is followed by either
   * `addSignal` (overwrites the placeholder with real data) or `removeSignal`
   * (clears the placeholder if opening is aborted). Otherwise the riskMap
   * accumulates stale reservations.
   *
   * @param params - Risk check arguments (passthrough from ClientStrategy)
   * @returns Promise resolving to true if allowed (and reserved), false if rejected (no reservation)
   */
  public checkSignalAndReserve = async (params: IRiskCheckArgs): Promise<boolean> => {
    return await this.checkSignal(params, { reserve: true });
  };
}

export default ClientRisk;
