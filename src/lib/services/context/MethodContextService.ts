import { scoped } from "di-scoped";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

/**
 * Method context containing schema names for operation routing.
 *
 * Propagated through MethodContextService to provide implicit context
 * for retrieving correct strategy/exchange/frame instances.
 */
export interface IMethodContext {
  /** Name of exchange schema to use */
  exchangeName: ExchangeName;
  /** Name of strategy schema to use */
  strategyName: StrategyName;
  /** Name of frame schema to use (empty string for live mode) */
  frameName: FrameName;
}

/**
 * Scoped service for method context propagation.
 *
 * Uses di-scoped for implicit context passing without explicit parameters.
 * Context includes strategyName, exchangeName, and frameName.
 *
 * Used by PublicServices to inject schema names into ConnectionServices.
 *
 * @example
 * ```typescript
 * MethodContextService.runAsyncIterator(
 *   backtestGenerator,
 *   {
 *     strategyName: "my-strategy",
 *     exchangeName: "my-exchange",
 *     frameName: "1d-backtest"
 *   }
 * );
 * ```
 */
export const MethodContextService = scoped(
  class {
    constructor(readonly context: IMethodContext) {}
  }
);

/**
 * Type helper for MethodContextService instance.
 * Used for dependency injection type annotations.
 */
export type TMethodContextService = InstanceType<
  typeof MethodContextService
>;

export default MethodContextService;
