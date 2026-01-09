import { ILogger } from "./Logger.interface";
import { ISignalDto, IRiskSignalRow, StrategyName, ISignalRow } from "./Strategy.interface";
import { ExchangeName } from "./Exchange.interface";
import { FrameName } from "./Frame.interface";

/**
 * Risk rejection result type.
 * Can be void, null, or an IRiskRejectionResult object.
 */
export type RiskRejection = void | IRiskRejectionResult | string | null;

/**
 * Risk check arguments for evaluating whether to allow opening a new position.
 * Called BEFORE signal creation to validate if conditions allow new signals.
 * Contains only passthrough arguments from ClientStrategy context.
 */
export interface IRiskCheckArgs {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Pending signal to apply */
  pendingSignal: ISignalDto | ISignalRow;
  /** Strategy name requesting to open a position */
  strategyName: StrategyName;
  /** Exchange name */
  exchangeName: ExchangeName;
  /** Frame name */
  frameName: FrameName;
  /** Current VWAP price */
  currentPrice: number;
  /** Current timestamp */
  timestamp: number;
}

/**
 * Active position tracked by ClientRisk for cross-strategy analysis.
 */
export interface IRiskActivePosition {
  /** Strategy name owning the position */
  strategyName: StrategyName;
  /** Exchange name */
  exchangeName: ExchangeName;
  /** Timestamp when the position was opened */
  openTimestamp: number;
}


/**
 * Optional callbacks for risk events.
 */
export interface IRiskCallbacks {
  /** Called when a signal is rejected due to risk limits */
  onRejected: (
    symbol: string,
    params: IRiskCheckArgs
  ) => void | Promise<void>;
  /** Called when a signal passes risk checks */
  onAllowed: (symbol: string, params: IRiskCheckArgs) => void | Promise<void>;
}

/**
 * Payload passed to risk validation functions.
 * Extends IRiskCheckArgs with portfolio state data.
 */
export interface IRiskValidationPayload extends IRiskCheckArgs {
  /** Pending signal to apply (IRiskSignalRow is calculated internally so priceOpen always exist) */
  pendingSignal: IRiskSignalRow;
  /** Number of currently active positions across all strategies */
  activePositionCount: number;
  /** List of currently active positions across all strategies */
  activePositions: IRiskActivePosition[];
}

/**
 * Risk validation rejection result.
 * Returned when validation fails, contains debugging information.
 */
export interface IRiskRejectionResult {
  /** Unique identifier for this rejection instance */
  id: string | null;
  /** Human-readable reason for rejection */
  note: string;
}

/**
 * Risk validation function type.
 * Returns null/void if validation passes, IRiskRejectionResult if validation fails.
 * Can also throw error which will be caught and converted to IRiskRejectionResult.
 */
export interface IRiskValidationFn {
  (payload: IRiskValidationPayload): RiskRejection | Promise<RiskRejection>;
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
  /** Custom validations array for risk logic */
  validations: (IRiskValidation | IRiskValidationFn)[];
}

/**
 * Risk parameters passed to ClientRisk constructor.
 * Combines schema with runtime dependencies and emission callbacks.
 */
export interface IRiskParams extends IRiskSchema {
  /** Logger service for debug output */
  logger: ILogger;

  /** True if backtest mode, false if live mode */
  backtest: boolean;

  /**
   * Callback invoked when a signal is rejected due to risk limits.
   * Called before emitting to riskSubject.
   * Used for event emission to riskSubject (separate from schema callbacks).
   *
   * @param symbol - Trading pair symbol
   * @param params - Risk check arguments
   * @param activePositionCount - Number of active positions at rejection time
   * @param rejectionResult - Rejection result with id and note
   * @param timestamp - Event timestamp in milliseconds
   * @param backtest - True if backtest mode, false if live mode
   */
  onRejected: (
    symbol: string,
    params: IRiskCheckArgs,
    activePositionCount: number,
    rejectionResult: IRiskRejectionResult,
    timestamp: number,
    backtest: boolean
  ) => void | Promise<void>;
}

/**
 * Risk interface implemented by ClientRisk.
 * Provides risk checking for signals and position tracking.
 */
export interface IRisk {
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
   * @param context - Context information (strategyName, riskName, exchangeName, frameName)
   */
  addSignal: (symbol: string, context: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName }) => Promise<void>;

  /**
   * Remove a closed signal/position.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context information (strategyName, riskName, exchangeName, frameName)
   */
  removeSignal: (symbol: string, context: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName }) => Promise<void>;
}

/**
 * Unique risk profile identifier.
 */
export type RiskName = string;
