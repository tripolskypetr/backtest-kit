import { scoped } from "di-scoped";

/**
 * Execution context containing runtime parameters for strategy/exchange operations.
 *
 * Propagated through ExecutionContextService to provide implicit context
 * for getCandles(), tick(), backtest() and other operations.
 */
export interface IExecutionContext {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Current timestamp for operation */
  when: Date;
  /** Whether running in backtest mode (true) or live mode (false) */
  backtest: boolean;
}

/**
 * Scoped service for execution context propagation.
 *
 * Uses di-scoped for implicit context passing without explicit parameters.
 * Context includes symbol, when (timestamp), and backtest flag.
 *
 * Used by GlobalServices to inject context into operations.
 *
 * @example
 * ```typescript
 * ExecutionContextService.runInContext(
 *   async () => {
 *     // Inside this callback, context is automatically available
 *     return await someOperation();
 *   },
 *   { symbol: "BTCUSDT", when: new Date(), backtest: true }
 * );
 * ```
 */
export const ExecutionContextService = scoped(
  class {
    constructor(readonly context: IExecutionContext) {}
  }
);

/**
 * Type helper for ExecutionContextService instance.
 * Used for dependency injection type annotations.
 */
export type TExecutionContextService = InstanceType<
  typeof ExecutionContextService
>;

export default ExecutionContextService;
