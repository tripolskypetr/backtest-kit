import engine from "../lib/index";
import { IOptimizerSchema } from "../interface/Optimizer.interface";

const LIST_OPTIMIZERS_METHOD_NAME = "list.listOptimizerSchema";

/**
 * Returns a list of all registered optimizer schemas.
 *
 * Retrieves all optimizers that have been registered via addOptimizer().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of optimizer schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listOptimizers, addOptimizer } from "backtest-kit";
 *
 * addOptimizer({
 *   optimizerName: "llm-strategy-generator",
 *   note: "Generates trading strategies using LLM",
 *   rangeTrain: [
 *     {
 *       note: "Training period 1",
 *       startDate: new Date("2024-01-01"),
 *       endDate: new Date("2024-01-31"),
 *     },
 *   ],
 *   rangeTest: {
 *     note: "Testing period",
 *     startDate: new Date("2024-02-01"),
 *     endDate: new Date("2024-02-28"),
 *   },
 *   source: [],
 *   getPrompt: async (symbol, messages) => "Generate strategy",
 * });
 *
 * const optimizers = listOptimizers();
 * console.log(optimizers);
 * // [{ optimizerName: "llm-strategy-generator", note: "Generates...", ... }]
 * ```
 */
export async function listOptimizerSchema(): Promise<IOptimizerSchema[]> {
  engine.loggerService.log(LIST_OPTIMIZERS_METHOD_NAME);
  return await engine.optimizerValidationService.list();
}
