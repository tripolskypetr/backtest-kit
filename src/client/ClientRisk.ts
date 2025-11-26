import {
  IRisk,
  IRiskParams,
  IRiskCheckArgs,
  IRiskValidation,
  IRiskValidationFn,
} from "../interfaces/Risk.interface";
import { ISignalRow } from "../interfaces/Strategy.interface";

/**
 * Active position tracked by ClientRisk for cross-strategy analysis.
 */
interface IActivePosition {
  signal: ISignalRow;
  strategyName: string;
  exchangeName: string;
  openTimestamp: number;
}

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
  private _activePositions = new Map<string, IActivePosition>();

  constructor(private readonly params: IRiskParams) {}

  /**
   * Returns all currently active positions across all strategies.
   * Used for cross-strategy risk analysis in custom validations.
   */
  public get activePositions(): ReadonlyMap<string, IActivePosition> {
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
  public async addSignal(symbol: string, context: { strategyName: string; riskName: string }){
    const key = `${context.strategyName}:${symbol}`;
    this._activePositions.set(key, {
      signal: null as any, // Signal details not needed for position tracking
      strategyName: context.strategyName,
      exchangeName: '',
      openTimestamp: Date.now(),
    });
    this.params.logger.log("ClientRisk addSignal", { symbol, context, key, count: this._activePositions.size });
  }

  /**
   * Removes a closed signal.
   * Called by StrategyConnectionService when signal is closed.
   */
  public async removeSignal(symbol: string, context: { strategyName: string; riskName: string }) {
    const key = `${context.strategyName}:${symbol}`;
    this._activePositions.delete(key);
    this.params.logger.log("ClientRisk removeSignal", { symbol, context, key, count: this._activePositions.size });
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
  public checkSignal = async (
    params: IRiskCheckArgs
  ): Promise<boolean> => {
    this.params.logger.log("ClientRisk checkSignal", {
      symbol: params.symbol,
      strategyName: params.strategyName,
      activePositions: this._activePositions.size,
    });

    // Execute custom validations
    if (this.params.validations && this.params.validations.length > 0) {
      for (const validation of this.params.validations) {
        try {
          if (typeof validation === "function") {
            await validation({ ...params, activePositionCount: this.activePositionCount });
          } else {
            await validation.validate({ ...params, activePositionCount: this.activePositionCount });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (this.params.callbacks?.onRejected) {
            this.params.callbacks.onRejected(
              params.symbol,
              errorMessage,
              "customValidation",
              params
            );
          }

          return false;
        }
      }
    }

    // All checks passed
    if (this.params.callbacks?.onAllowed) {
      this.params.callbacks.onAllowed(params.symbol, params);
    }

    return true;
  };
}

export default ClientRisk;
