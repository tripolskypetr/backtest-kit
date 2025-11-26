import { ILogger } from "./Logger.interface";
import { StrategyName } from "./Strategy.interface";
import { ExchangeName } from "./Exchange.interface";

/**
 * Risk check arguments for evaluating whether to allow opening a new position.
 * Called BEFORE signal creation to validate if conditions allow new signals.
 * Contains only passthrough arguments from ClientStrategy context.
 */
export interface IRiskCheckArgs {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name requesting to open a position */
  strategyName: StrategyName;
  /** Exchange name */
  exchangeName: ExchangeName;
  /** Current VWAP price */
  currentPrice: number;
  /** Current timestamp */
  timestamp: number;
}

/**
 * Optional callbacks for risk events.
 */
export interface IRiskCallbacks {
  /** Called when a signal is rejected due to risk limits */
  onRejected: (
    symbol: string,
    reason: string,
    violatedLimit: string,
    params: IRiskCheckArgs
  ) => void;
  /** Called when a signal passes risk checks */
  onAllowed: (symbol: string, params: IRiskCheckArgs) => void;
}

/**
 * Payload passed to risk validation functions.
 * Extends IRiskCheckArgs with portfolio state data.
 */
export interface IRiskValidationPayload extends IRiskCheckArgs {
  /** Number of currently active positions across all strategies */
  activePositionCount: number;
}

/**
 * Risk validation function type.
 * Validates risk parameters and throws error if validation fails.
 */
export interface IRiskValidationFn {
  (payload: IRiskValidationPayload): void | Promise<void>;
}

/**
 * Risk validation configuration.
 * Defines validation logic with optional documentation.
 */
export interface IRiskValidation {
  /**
   * The validation function to apply to the risk check parameters.
   */
  validate: IRiskValidationFn;

  /**
   * Optional description for documentation purposes.
   * Aids in understanding the purpose or behavior of the validation.
   */
  note?: string;
}

/**
 * Risk schema registered via addRisk().
 * Defines portfolio-level risk controls via custom validations.
 */
export interface IRiskSchema {
  /** Unique risk profile identifier */
  riskName: RiskName;
  /** Optional developer note for documentation */
  note?: string;
  /** Optional lifecycle event callbacks (onRejected, onAllowed) */
  callbacks?: Partial<IRiskCallbacks>;
  /** Optional custom validations array for risk logic */
  validations?: (IRiskValidation | IRiskValidationFn)[];
}

/**
 * Risk parameters passed to ClientRisk constructor.
 * Combines schema with runtime dependencies.
 */
export interface IRiskParams extends IRiskSchema {
  /** Logger service for debug output */
  logger: ILogger;
}

/**
 * Risk interface implemented by ClientRisk.
 * Provides risk checking for signals and position tracking.
 */
export interface IRisk {
  /**
   * Returns number of currently active positions across all strategies.
   */
  readonly activePositionCount: number;

  /**
   * Check if a signal should be allowed based on risk limits.
   *
   * @param params - Risk check arguments (position size, portfolio state, etc.)
   * @returns Promise resolving to risk check result
   */
  checkSignal: (params: IRiskCheckArgs) => Promise<boolean>;

  /**
   * Register a new opened signal/position.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context information (strategyName, riskName)
   */
  addSignal: (symbol: string, context: { strategyName: string; riskName: string }) => Promise<void>;

  /**
   * Remove a closed signal/position.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context information (strategyName, riskName)
   */
  removeSignal: (symbol: string, context: { strategyName: string; riskName: string }) => Promise<void>;
}

/**
 * Unique risk profile identifier.
 */
export type RiskName = string;
