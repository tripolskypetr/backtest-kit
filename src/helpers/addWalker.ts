import backtest from "../lib";
import { IWalkerSchema } from "../interfaces/Walker.interface";

/**
 * Registers a new walker schema for strategy comparison.
 *
 * Walker executes backtests for multiple strategies on the same data
 * and compares their performance using a specified metric.
 *
 * @param walkerSchema - Walker configuration with strategies to compare
 * @throws Error if walkerName already exists or validation fails
 *
 * @example
 * ```typescript
 * import { addWalker } from "backtest-kit";
 *
 * addWalker({
 *   walkerName: "llm-prompt-optimizer",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest",
 *   strategies: [
 *     "my-strategy-v1",
 *     "my-strategy-v2",
 *     "my-strategy-v3"
 *   ],
 *   metric: "sharpeRatio",
 *   callbacks: {
 *     onStrategyComplete: (strategyName, symbol, stats, metric) => {
 *       console.log(`${strategyName}: ${metric}`);
 *     },
 *     onComplete: (results) => {
 *       console.log(`Best strategy: ${results.bestStrategy}`);
 *     }
 *   }
 * });
 * ```
 */
export function addWalker(walkerSchema: IWalkerSchema) {
  backtest.walkerSchemaService.register(
    walkerSchema.walkerName,
    walkerSchema
  );
}

export default addWalker;
