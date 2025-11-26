import { errorData, getErrorMessage, not, trycatch } from "functools-kit";
import {
  IRisk,
  IRiskParams,
  IRiskCheckArgs,
  IRiskValidation,
  IRiskValidationFn,
  IRiskValidationPayload,
  IRiskActivePosition,
} from "../interfaces/Risk.interface";
import { ISignalRow } from "../interfaces/Strategy.interface";
import backtest from "src/lib";

/** Key generator for active position map */
const GET_KEY_FN = (strategyName: string, symbol: string) =>
  `${strategyName}:${symbol}`;

/** Wrapper to execute risk validation function with error handling */
const DO_VALIDATION_FN = trycatch(
  async (validation: IRiskValidationFn, params: IRiskValidationPayload) => {
    await validation(params);
    return true;
  },
  {
    defaultValue: false,
    fallback: (error) => {
      backtest.loggerService.warn("ClientRisk exception thrown", {
        error: errorData(error),
        message: getErrorMessage(error),
      });
      //errorEmitter.next(error);
    },
  }
);

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
   */
  private _activePositions = new Map<string, IRiskActivePosition>();

  constructor(private readonly params: IRiskParams) {}

  /**
   * Returns all currently active positions across all strategies.
   * Used for cross-strategy risk analysis in custom validations.
   */
  public get activePositions(): ReadonlyMap<string, IRiskActivePosition> {
    return this._activePositions;
  }

  /**
   * Returns number of currently active positions.
   */
  public get activePositionCount(): number {
    return this._activePositions.size;
  }

  /**
   * Registers a new opened signal.
   * Called by StrategyConnectionService after signal is opened.
   */
  public async addSignal(
    symbol: string,
    context: { strategyName: string; riskName: string }
  ) {
    this.params.logger.debug("ClientRisk addSignal", {
      symbol,
      context,
      count: this._activePositions.size,
    });
    const key = GET_KEY_FN(context.strategyName, symbol);
    this._activePositions.set(key, {
      signal: null as any, // Signal details not needed for position tracking
      strategyName: context.strategyName,
      exchangeName: "",
      openTimestamp: Date.now(),
    });
  }

  /**
   * Removes a closed signal.
   * Called by StrategyConnectionService when signal is closed.
   */
  public async removeSignal(
    symbol: string,
    context: { strategyName: string; riskName: string }
  ) {
    this.params.logger.debug("ClientRisk removeSignal", {
      symbol,
      context,
      count: this._activePositions.size,
    });
    const key = GET_KEY_FN(context.strategyName, symbol);
    this._activePositions.delete(key);
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
      activePositions: this._activePositions.size,
    });

    const payload: IRiskValidationPayload = {
      ...params,
      activePositionCount: this._activePositions.size,
      activePositions: Array.from(this._activePositions.values()),
    };

    // Execute custom validations
    let isValid = true;
    for (const validation of this.params.validations) {
      if (
        not(
          DO_VALIDATION_FN(
            typeof validation === "function" ? validation : validation.validate,
            payload
          )
        )
      ) {
        isValid = false;
        break;
      }
    }

    if (!isValid) {
      if (this.params.callbacks?.onRejected) {
        this.params.callbacks.onRejected(params.symbol, params);
      }

      return false;
    }

    // All checks passed
    if (this.params.callbacks?.onAllowed) {
      this.params.callbacks.onAllowed(params.symbol, params);
    }

    return true;
  };
}

export default ClientRisk;
