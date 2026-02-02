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
  IRiskValidationPayload,
  IRiskActivePosition,
  IRiskRejectionResult,
  RiskRejection,
  IRiskValidationFn,
  RiskName,
} from "../interfaces/Risk.interface";
import { PersistRiskAdapter } from "../classes/Persist";
import backtest from "../lib";
import { validationSubject, errorEmitter } from "../config/emitters";
import { get } from "../utils/get";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { IRiskSignalRow, ISignalDto, ISignalRow, StrategyName } from "../interfaces/Strategy.interface";

/** Type for active position map */
type RiskMap = Map<string, IRiskActivePosition>;

/** Symbol indicating that positions need to be fetched from persistence */
const POSITION_NEED_FETCH = Symbol("risk-need-fetch");

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
const TO_RISK_SIGNAL = <T extends ISignalRow>(signal: T, currentPrice: number): IRiskSignalRow => {
  const hasTrailingSL = "_trailingPriceStopLoss" in signal && signal._trailingPriceStopLoss !== undefined;
  const hasTrailingTP = "_trailingPriceTakeProfit" in signal && signal._trailingPriceTakeProfit !== undefined;
  const partialExecuted = ("_partial" in signal && Array.isArray(signal._partial))
    ? signal._partial.reduce((sum, partial) => sum + partial.percent, 0)
    : 0;

  return {
    ...structuredClone(signal) as ISignalRow,
    priceOpen: signal.priceOpen ?? currentPrice,
    priceStopLoss: hasTrailingSL ? signal._trailingPriceStopLoss : signal.priceStopLoss,
    priceTakeProfit: hasTrailingTP ? signal._trailingPriceTakeProfit : signal.priceTakeProfit,
    originalPriceStopLoss: signal.priceStopLoss,
    originalPriceTakeProfit: signal.priceTakeProfit,
    partialExecuted,
  };
};

/** Key generator for active position map */
const CREATE_NAME_FN = (strategyName: StrategyName, exchangeName: ExchangeName, symbol: string) =>
  `${strategyName}_${exchangeName}_${symbol}` as const;

/** Wrapper to execute risk validation function with error handling */
const DO_VALIDATION_FN = async (
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
    backtest.loggerService.warn(message, payload);
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
    fallback: (error) => {
      const message = "ClientRisk CALL_REJECTED_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
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
    fallback: (error) => {
      const message = "ClientRisk CALL_ALLOWED_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
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
export const WAIT_FOR_INIT_FN = async (self: ClientRisk): Promise<void> => {
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
  );
  self._activePositions = new Map(persistedPositions);
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
   * Key: `${strategyName}:${exchangeName}:${symbol}`
   * Starts as POSITION_NEED_FETCH symbol, gets initialized on first use.
   */
  _activePositions: RiskMap | typeof POSITION_NEED_FETCH = POSITION_NEED_FETCH;

  constructor(readonly params: IRiskParams) {}

  /**
   * Initializes active positions by loading from persistence.
   * Uses singleshot pattern to ensure initialization happens exactly once.
   * Skips persistence in backtest mode.
   */
  private waitForInit = singleshot(async () => await WAIT_FOR_INIT_FN(this));

  /**
   * Persists current active positions to disk.
   * Skips in backtest mode.
   */
  private async _updatePositions(): Promise<void> {
    if (this.params.backtest) {
      return;
    }

    if (this._activePositions === POSITION_NEED_FETCH) {
      await this.waitForInit();
    }

    await PersistRiskAdapter.writePositionData(
      Array.from(<RiskMap>this._activePositions),
      this.params.riskName,
      this.params.exchangeName,
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

    if (this._activePositions === POSITION_NEED_FETCH) {
      await this.waitForInit();
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

    await this._updatePositions();
  }

  /**
   * Removes a closed signal.
   * Called by StrategyConnectionService when signal is closed.
   */
  public async removeSignal(
    symbol: string,
    context: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; }
  ) {
    this.params.logger.debug("ClientRisk removeSignal", {
      symbol,
      context,
      backtest: this.params.backtest,
    });

    if (this._activePositions === POSITION_NEED_FETCH) {
      await this.waitForInit();
    }

    const key = CREATE_NAME_FN(context.strategyName, context.exchangeName, symbol);
    const riskMap = <RiskMap>this._activePositions;
    riskMap.delete(key);

    await this._updatePositions();
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
  public checkSignal = async (params: IRiskCheckArgs): Promise<boolean> => {
    this.params.logger.debug("ClientRisk checkSignal", {
      symbol: params.symbol,
      strategyName: params.strategyName,
      backtest: this.params.backtest,
    });

    if (this._activePositions === POSITION_NEED_FETCH) {
      await this.waitForInit();
    }

    const riskMap = <RiskMap>this._activePositions;

    const payload: IRiskValidationPayload = {
      ...params,
      currentSignal: TO_RISK_SIGNAL(
        params.currentSignal,
        params.currentPrice
      ),
      activePositionCount: riskMap.size,
      activePositions: Array.from(riskMap.values()),
    };

    let rejectionResult: IRiskRejectionResult | null = null;

    if (this.params.validations) {
      for (const validation of this.params.validations) {
        const rejection = await DO_VALIDATION_FN(
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
      // Call params.onRejected for riskSubject emission
      await this.params.onRejected(
        params.symbol,
        params,
        riskMap.size,
        rejectionResult,
        params.timestamp,
        this.params.backtest
      );

      // Call schema callbacks.onRejected if defined
      await CALL_REJECTED_CALLBACKS_FN(this, params.symbol, params);

      return false;
    }

    // All checks passed
    await CALL_ALLOWED_CALLBACKS_FN(this, params.symbol, params);

    return true;
  };
}

export default ClientRisk;
