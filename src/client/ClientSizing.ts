import {
  ISizing,
  ISizingParams,
  ISizingCalculateParams,
  ISizingCalculateParamsFixedPercentage,
  ISizingCalculateParamsKelly,
  ISizingCalculateParamsATR,
  ISizingSchemaFixedPercentage,
  ISizingSchemaKelly,
  ISizingSchemaATR,
} from "../interfaces/Sizing.interface";
import { trycatch, errorData, getErrorMessage } from "functools-kit";
import backtest from "../lib";
import { errorEmitter } from "../config/emitters";

/**
 * Calculates position size using fixed percentage risk method.
 * Risk amount = accountBalance * riskPercentage
 * Position size = riskAmount / |priceOpen - priceStopLoss|
 *
 * @param params - Calculation parameters
 * @param schema - Fixed percentage schema
 * @returns Calculated position size
 */
const calculateFixedPercentage = (
  params: ISizingCalculateParamsFixedPercentage,
  schema: ISizingSchemaFixedPercentage
): number => {
  const { accountBalance, priceOpen, priceStopLoss } = params;
  const { riskPercentage } = schema;

  const riskAmount = accountBalance * (riskPercentage / 100);
  const stopDistance = Math.abs(priceOpen - priceStopLoss);

  if (stopDistance === 0) {
    throw new Error("Stop-loss distance cannot be zero");
  }

  return riskAmount / stopDistance;
};

/**
 * Calculates position size using Kelly Criterion.
 * Kelly % = (winRate * winLossRatio - (1 - winRate)) / winLossRatio
 * Position size = accountBalance * kellyPercentage * kellyMultiplier / priceOpen
 *
 * @param params - Calculation parameters
 * @param schema - Kelly schema
 * @returns Calculated position size
 */
const calculateKellyCriterion = (
  params: ISizingCalculateParamsKelly,
  schema: ISizingSchemaKelly
): number => {
  const { accountBalance, priceOpen, winRate, winLossRatio } = params;
  const { kellyMultiplier = 0.25 } = schema;

  if (winRate <= 0 || winRate >= 1) {
    throw new Error("winRate must be between 0 and 1");
  }

  if (winLossRatio <= 0) {
    throw new Error("winLossRatio must be positive");
  }

  // Kelly formula: (W * R - L) / R
  // W = win rate, L = loss rate (1 - W), R = win/loss ratio
  const kellyPercentage =
    (winRate * winLossRatio - (1 - winRate)) / winLossRatio;

  // Kelly can be negative (edge is negative) or very large
  // Apply multiplier to reduce risk (common practice: 0.25 for quarter Kelly)
  const adjustedKelly = Math.max(0, kellyPercentage) * kellyMultiplier;

  return (accountBalance * adjustedKelly) / priceOpen;
};

/**
 * Calculates position size using ATR-based method.
 * Risk amount = accountBalance * riskPercentage
 * Position size = riskAmount / (ATR * atrMultiplier)
 *
 * @param params - Calculation parameters
 * @param schema - ATR schema
 * @returns Calculated position size
 */
const calculateATRBased = (
  params: ISizingCalculateParamsATR,
  schema: ISizingSchemaATR
): number => {
  const { accountBalance, atr } = params;
  const { riskPercentage, atrMultiplier = 2 } = schema;

  if (atr <= 0) {
    throw new Error("ATR must be positive");
  }

  const riskAmount = accountBalance * (riskPercentage / 100);
  const stopDistance = atr * atrMultiplier;

  return riskAmount / stopDistance;
};

/**
 * Wrapper to call onCalculate callback with error handling.
 * Catches and logs any errors thrown by the user-provided callback.
 *
 * @param self - ClientSizing instance reference
 * @param quantity - Calculated position size
 * @param params - Parameters used for size calculation
 */
const CALL_CALCULATE_CALLBACKS_FN = trycatch(
  async (
    self: ClientSizing,
    quantity: number,
    params: ISizingCalculateParams
  ): Promise<void> => {
    if (self.params.callbacks?.onCalculate) {
      await self.params.callbacks.onCalculate(quantity, params);
    }
  },
  {
    fallback: (error) => {
      const message = "ClientSizing CALL_CALCULATE_CALLBACKS_FN thrown";
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
 * Main calculation function routing to specific sizing method.
 * Applies min/max constraints after calculation.
 *
 * @param params - Calculation parameters
 * @param self - ClientSizing instance reference
 * @returns Calculated and constrained position size
 */
const CALCULATE_FN = async (
  params: ISizingCalculateParams,
  self: ClientSizing
): Promise<number> => {
  self.params.logger.debug("ClientSizing calculate", {
    symbol: params.symbol,
    method: params.method,
  });

  const schema = self.params;
  let quantity: number;

  // Type-safe routing based on discriminated union using schema.method
  if (schema.method === "fixed-percentage") {
    if (params.method !== "fixed-percentage") {
      throw new Error(
        `Params method mismatch: expected fixed-percentage, got ${params.method}`
      );
    }
    quantity = calculateFixedPercentage(params, schema);
  } else if (schema.method === "kelly-criterion") {
    if (params.method !== "kelly-criterion") {
      throw new Error(
        `Params method mismatch: expected kelly-criterion, got ${params.method}`
      );
    }
    quantity = calculateKellyCriterion(params, schema);
  } else if (schema.method === "atr-based") {
    if (params.method !== "atr-based") {
      throw new Error(
        `Params method mismatch: expected atr-based, got ${params.method}`
      );
    }
    quantity = calculateATRBased(params, schema);
  } else {
    const _exhaustiveCheck: never = schema;
    throw new Error(
      `ClientSizing calculate: unknown method ${(_exhaustiveCheck as any).method}`
    );
  }

  // Apply max position percentage constraint
  if (schema.maxPositionPercentage !== undefined) {
    const maxByPercentage =
      (params.accountBalance * schema.maxPositionPercentage) /
      100 /
      params.priceOpen;
    quantity = Math.min(quantity, maxByPercentage);
  }

  // Apply min/max absolute constraints
  if (schema.minPositionSize !== undefined) {
    quantity = Math.max(quantity, schema.minPositionSize);
  }

  if (schema.maxPositionSize !== undefined) {
    quantity = Math.min(quantity, schema.maxPositionSize);
  }

  // Trigger callback if defined
  await CALL_CALCULATE_CALLBACKS_FN(self, quantity, params);

  return quantity;
};

/**
 * Client implementation for position sizing calculation.
 *
 * Features:
 * - Multiple sizing methods (fixed %, Kelly, ATR)
 * - Min/max position constraints
 * - Max position percentage limit
 * - Callback support for validation and logging
 *
 * Used by strategy execution to determine optimal position sizes.
 */
export class ClientSizing implements ISizing {
  constructor(readonly params: ISizingParams) {}

  /**
   * Calculates position size based on configured method and constraints.
   *
   * @param params - Calculation parameters (symbol, balance, prices, etc.)
   * @returns Promise resolving to calculated position size
   * @throws Error if required parameters are missing or invalid
   */
  public async calculate(
    params: ISizingCalculateParams
  ): Promise<number> {
    return await CALCULATE_FN(params, this);
  };
}

export default ClientSizing;
