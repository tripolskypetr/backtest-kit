
import { OptimizerName } from "../interface/Optimizer.interface";
import engine from "../lib";

const GET_OPTIMIZER_METHOD_NAME = "get.getOptimizerSchema";

/**
 * Retrieves a registered optimizer schema by name.
 *
 * @param optimizerName - Unique optimizer identifier
 * @returns The optimizer schema configuration object
 * @throws Error if optimizer is not registered
 *
 * @example
 * ```typescript
 * const optimizer = getOptimizer("llm-strategy-generator");
 * console.log(optimizer.rangeTrain); // Array of training ranges
 * console.log(optimizer.rangeTest); // Testing range
 * console.log(optimizer.source); // Array of data sources
 * console.log(optimizer.getPrompt); // async function
 * ```
 */
export function getOptimizerSchema(optimizerName: OptimizerName) {
  engine.loggerService.log(GET_OPTIMIZER_METHOD_NAME, {
    optimizerName,
  });

  engine.optimizerValidationService.validate(
    optimizerName,
    GET_OPTIMIZER_METHOD_NAME
  );

  return engine.optimizerSchemaService.get(optimizerName);
}
