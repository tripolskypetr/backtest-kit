import { OptimizerName } from "../interface/Optimizer.interface";
import engine from "../lib";

const OPTIMIZER_METHOD_NAME_GET_DATA = "OptimizerUtils.getData";
const OPTIMIZER_METHOD_NAME_GET_CODE = "OptimizerUtils.getCode";
const OPTIMIZER_METHOD_NAME_DUMP = "OptimizerUtils.dump";

/**
 * Public API utilities for optimizer operations.
 * Provides high-level methods for strategy generation and code export.
 *
 * Usage:
 * ```typescript
 * import { Optimizer } from "@backtest-kit/ollama";
 *
 * // Get strategy data
 * const strategies = await Optimizer.getData("BTCUSDT", {
 *   optimizerName: "my-optimizer"
 * });
 *
 * // Generate code
 * const code = await Optimizer.getCode("BTCUSDT", {
 *   optimizerName: "my-optimizer"
 * });
 *
 * // Save to file
 * await Optimizer.dump("BTCUSDT", {
 *   optimizerName: "my-optimizer"
 * }, "./output");
 * ```
 */
export class OptimizerUtils {
  /**
   * Fetches data from all sources and generates strategy metadata.
   * Processes each training range and builds LLM conversation history.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context with optimizerName
   * @returns Array of generated strategies with conversation context
   * @throws Error if optimizer not found
   */
  public getData = async (
    symbol: string,
    context: {
      optimizerName: OptimizerName;
    }
  ) => {
    engine.loggerService.info(OPTIMIZER_METHOD_NAME_GET_DATA, {
      symbol,
      context,
    });

    engine.optimizerValidationService.validate(context.optimizerName, OPTIMIZER_METHOD_NAME_GET_DATA);

    return await engine.optimizerGlobalService.getData(
      symbol,
      context.optimizerName
    );
  };

  /**
   * Generates complete executable strategy code.
   * Includes imports, helpers, strategies, walker, and launcher.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context with optimizerName
   * @returns Generated TypeScript/JavaScript code as string
   * @throws Error if optimizer not found
   */
  public getCode = async (
    symbol: string,
    context: {
      optimizerName: OptimizerName;
    }
  ): Promise<string> => {
    engine.loggerService.info(OPTIMIZER_METHOD_NAME_GET_CODE, {
      symbol,
      context,
    });

    engine.optimizerValidationService.validate(context.optimizerName, OPTIMIZER_METHOD_NAME_GET_CODE);

    return await engine.optimizerGlobalService.getCode(
      symbol,
      context.optimizerName
    );
  };

  /**
   * Generates and saves strategy code to file.
   * Creates directory if needed, writes .mjs file.
   *
   * Format: `{optimizerName}_{symbol}.mjs`
   *
   * @param symbol - Trading pair symbol
   * @param context - Context with optimizerName
   * @param path - Output directory path (default: "./")
   * @throws Error if optimizer not found or file write fails
   */
  public dump = async (
    symbol: string,
    context: {
      optimizerName: string;
    },
    path?: string
  ): Promise<void> => {
    engine.loggerService.info(OPTIMIZER_METHOD_NAME_DUMP, {
      symbol,
      context,
      path,
    });

    engine.optimizerValidationService.validate(context.optimizerName, OPTIMIZER_METHOD_NAME_DUMP);

    await engine.optimizerGlobalService.dump(
      symbol,
      context.optimizerName,
      path
    );
  };
}

/**
 * Singleton instance of OptimizerUtils.
 * Public API for optimizer operations.
 *
 * @example
 * ```typescript
 * import { Optimizer } from "@backtest-kit/ollama";
 *
 * await Optimizer.dump("BTCUSDT", { optimizerName: "my-optimizer" });
 * ```
 */
export const Optimizer = new OptimizerUtils();
