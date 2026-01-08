import { ILogger } from "./Logger.interface";

/**
 * Base parameters common to all sizing calculations.
 */
export interface ISizingCalculateParamsBase {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Current account balance */
  accountBalance: number;
  /** Planned entry price */
  priceOpen: number;
}

/**
 * Public API parameters for fixed percentage sizing (without method field).
 */
export interface IPositionSizeFixedPercentageParams extends ISizingCalculateParamsBase {
  /** Stop-loss price */
  priceStopLoss: number;
}

/**
 * Public API parameters for Kelly Criterion sizing (without method field).
 */
export interface IPositionSizeKellyParams extends ISizingCalculateParamsBase {
  /** Win rate (0-1) */
  winRate: number;
  /** Average win/loss ratio */
  winLossRatio: number;
}

/**
 * Public API parameters for ATR-based sizing (without method field).
 */
export interface IPositionSizeATRParams extends ISizingCalculateParamsBase {
  /** Current ATR value */
  atr: number;
}

/**
 * Parameters for fixed percentage sizing calculation.
 */
export interface ISizingCalculateParamsFixedPercentage extends ISizingCalculateParamsBase {
  method: "fixed-percentage";
  /** Stop-loss price */
  priceStopLoss: number;
}

/**
 * Parameters for Kelly Criterion sizing calculation.
 */
export interface ISizingCalculateParamsKelly extends ISizingCalculateParamsBase {
  method: "kelly-criterion";
  /** Win rate (0-1) */
  winRate: number;
  /** Average win/loss ratio */
  winLossRatio: number;
}

/**
 * Parameters for ATR-based sizing calculation.
 */
export interface ISizingCalculateParamsATR extends ISizingCalculateParamsBase {
  method: "atr-based";
  /** Current ATR value */
  atr: number;
}

/**
 * Discriminated union for position size calculation parameters.
 * Type-safe parameters based on sizing method.
 */
export type ISizingCalculateParams =
  | ISizingCalculateParamsFixedPercentage
  | ISizingCalculateParamsKelly
  | ISizingCalculateParamsATR;

/**
 * Fixed percentage sizing parameters for ClientSizing constructor.
 */
export interface ISizingParamsFixedPercentage extends ISizingSchemaFixedPercentage {
  /** Logger service for debug output */
  logger: ILogger;
}

/**
 * Kelly Criterion sizing parameters for ClientSizing constructor.
 */
export interface ISizingParamsKelly extends ISizingSchemaKelly {
  /** Logger service for debug output */
  logger: ILogger;
}

/**
 * ATR-based sizing parameters for ClientSizing constructor.
 */
export interface ISizingParamsATR extends ISizingSchemaATR {
  /** Logger service for debug output */
  logger: ILogger;
}

/**
 * Discriminated union for sizing parameters passed to ClientSizing constructor.
 * Extends ISizingSchema with logger instance for internal logging.
 */
export type ISizingParams =
  | ISizingParamsFixedPercentage
  | ISizingParamsKelly
  | ISizingParamsATR;

/**
 * Callbacks for sizing lifecycle events.
 */
export interface ISizingCallbacks {
  /**
   * Called after position size calculation.
   * Useful for logging or validating the calculated size.
   *
   * @param quantity - Calculated position size
   * @param params - Parameters used for calculation
   */
  onCalculate: (
    quantity: number,
    params: ISizingCalculateParams
  ) => void | Promise<void>;
}

/**
 * Base sizing schema with common fields.
 */
export interface ISizingSchemaBase {
  /** Unique identifier for this sizing configuration */
  sizingName: SizingName;
  /** Optional developer note for documentation */
  note?: string;
  /** Maximum position size as % of account (0-100) */
  maxPositionPercentage?: number;
  /** Minimum position size (absolute value) */
  minPositionSize?: number;
  /** Maximum position size (absolute value) */
  maxPositionSize?: number;
  /** Optional lifecycle callbacks */
  callbacks?: Partial<ISizingCallbacks>;
}

/**
 * Fixed percentage sizing schema.
 *
 * @example
 * ```typescript
 * addSizing({
 *   sizingName: "conservative",
 *   method: "fixed-percentage",
 *   riskPercentage: 1,
 * });
 * ```
 */
export interface ISizingSchemaFixedPercentage extends ISizingSchemaBase {
  method: "fixed-percentage";
  /** Risk percentage per trade (0-100) */
  riskPercentage: number;
}

/**
 * Kelly Criterion sizing schema.
 *
 * @example
 * ```typescript
 * addSizing({
 *   sizingName: "kelly",
 *   method: "kelly-criterion",
 *   kellyMultiplier: 0.25,
 * });
 * ```
 */
export interface ISizingSchemaKelly extends ISizingSchemaBase {
  method: "kelly-criterion";
  /** Kelly Criterion multiplier (0-1, default 0.25 for quarter Kelly) */
  kellyMultiplier?: number;
}

/**
 * ATR-based sizing schema.
 *
 * @example
 * ```typescript
 * addSizing({
 *   sizingName: "atr",
 *   method: "atr-based",
 *   riskPercentage: 2,
 *   atrMultiplier: 2,
 * });
 * ```
 */
export interface ISizingSchemaATR extends ISizingSchemaBase {
  method: "atr-based";
  /** Risk percentage per trade (0-100) */
  riskPercentage: number;
  /** ATR multiplier for stop distance calculation */
  atrMultiplier?: number;
}

/**
 * Discriminated union for sizing schemas.
 * Type-safe configuration based on sizing method.
 */
export type ISizingSchema =
  | ISizingSchemaFixedPercentage
  | ISizingSchemaKelly
  | ISizingSchemaATR;

/**
 * Sizing interface for position size calculation.
 * Used internally by strategy execution.
 */
export interface ISizing {
  /**
   * Calculates position size based on risk parameters.
   *
   * @param params - Calculation parameters (symbol, balance, prices, etc.)
   * @returns Promise resolving to calculated position size
   */
  calculate: (params: ISizingCalculateParams) => Promise<number>;
}

/**
 * Unique identifier for a sizing schema.
 * Used to retrieve sizing instances via dependency injection.
 */
export type SizingName = string;
