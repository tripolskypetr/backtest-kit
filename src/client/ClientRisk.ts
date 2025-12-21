import {
  errorData,
  getErrorMessage,
  not,
  singleshot,
  trycatch,
} from "functools-kit";
import {
  IRisk,
  IRiskParams,
  IRiskCheckArgs,
  IRiskValidationFn,
  IRiskValidationPayload,
  IRiskActivePosition,
} from "../interfaces/Risk.interface";
import backtest from "../lib";
import { validationSubject } from "../config/emitters";
import { PersistRiskAdapter } from "../classes/Persist";

/** Type for active position map */
type RiskMap = Map<string, IRiskActivePosition>;

/** Symbol indicating that positions need to be fetched from persistence */
const POSITION_NEED_FETCH = Symbol("risk-need-fetch");

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
      const message = "ClientRisk exception thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      validationSubject.next(error);
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
  self.params.logger.debug("ClientRisk waitForInit", { backtest: self.params.backtest });

  if (self.params.backtest) {
    self._activePositions = new Map();
    return;
  }

  const persistedPositions = await PersistRiskAdapter.readPositionData(
    self.params.riskName
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
      this.params.riskName
    );
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
      backtest: this.params.backtest,
    });

    if (this._activePositions === POSITION_NEED_FETCH) {
      await this.waitForInit();
    }

    const key = GET_KEY_FN(context.strategyName, symbol);
    const riskMap = <RiskMap>this._activePositions;
    riskMap.set(key, {
      signal: null as any, // Signal details not needed for position tracking
      strategyName: context.strategyName,
      exchangeName: "",
      openTimestamp: Date.now(),
    });

    await this._updatePositions();
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
      backtest: this.params.backtest,
    });

    if (this._activePositions === POSITION_NEED_FETCH) {
      await this.waitForInit();
    }

    const key = GET_KEY_FN(context.strategyName, symbol);
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
      activePositionCount: riskMap.size,
      activePositions: Array.from(riskMap.values()),
    };

    // Execute custom validations
    let isValid = true;
    let rejectionNote = "N/A";
    if (this.params.validations) {
      for (const validation of this.params.validations) {
        if (
          not(
            await DO_VALIDATION_FN(
              typeof validation === "function"
                ? validation
                : validation.validate,
              payload
            )
          )
        ) {
          isValid = false;
          // Capture note from validation if available
          if (typeof validation !== "function" && validation.note) {
            rejectionNote = validation.note;
          }
          break;
        }
      }
    }

    if (!isValid) {
      // Call params.onRejected for riskSubject emission
      await this.params.onRejected(params.symbol, params, riskMap.size, rejectionNote, Date.now());

      // Call schema callbacks.onRejected if defined
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
