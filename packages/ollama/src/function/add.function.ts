import engine from "../lib/index";
import { IOptimizerSchema } from "../interface/Optimizer.interface";

const ADD_OPTIMIZER_METHOD_NAME = "add.addOptimizerSchema";

/**
 * Registers an optimizer configuration in the framework.
 *
 * The optimizer generates trading strategies by:
 * - Collecting data from multiple sources across training periods
 * - Building LLM conversation history with fetched data
 * - Generating strategy prompts using getPrompt()
 * - Creating executable backtest code with templates
 *
 * The optimizer produces a complete .mjs file containing:
 * - Exchange, Frame, Strategy, and Walker configurations
 * - Multi-timeframe analysis logic
 * - LLM integration for signal generation
 * - Event listeners for progress tracking
 *
 * @param optimizerSchema - Optimizer configuration object
 * @param optimizerSchema.optimizerName - Unique optimizer identifier
 * @param optimizerSchema.rangeTrain - Array of training time ranges (each generates a strategy variant)
 * @param optimizerSchema.rangeTest - Testing time range for strategy validation
 * @param optimizerSchema.source - Array of data sources (functions or source objects with custom formatters)
 * @param optimizerSchema.getPrompt - Function to generate strategy prompt from conversation history
 * @param optimizerSchema.template - Optional custom template overrides (top banner, helpers, strategy logic, etc.)
 * @param optimizerSchema.callbacks - Optional lifecycle callbacks (onData, onCode, onDump, onSourceData)
 *
 * @example
 * ```typescript
 * // Basic optimizer with single data source
 * addOptimizerSchema({
 *   optimizerName: "llm-strategy-generator",
 *   rangeTrain: [
 *     {
 *       note: "Bull market period",
 *       startDate: new Date("2024-01-01"),
 *       endDate: new Date("2024-01-31"),
 *     },
 *     {
 *       note: "Bear market period",
 *       startDate: new Date("2024-02-01"),
 *       endDate: new Date("2024-02-28"),
 *     },
 *   ],
 *   rangeTest: {
 *     note: "Validation period",
 *     startDate: new Date("2024-03-01"),
 *     endDate: new Date("2024-03-31"),
 *   },
 *   source: [
 *     {
 *       name: "historical-backtests",
 *       fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
 *         // Fetch historical backtest results from database
 *         return await db.backtests.find({
 *           symbol,
 *           date: { $gte: startDate, $lte: endDate },
 *         })
 *         .skip(offset)
 *         .limit(limit);
 *       },
 *       user: async (symbol, data, name) => {
 *         return `Analyze these ${data.length} backtest results for ${symbol}:\n${JSON.stringify(data)}`;
 *       },
 *       assistant: async (symbol, data, name) => {
 *         return "Historical data analyzed successfully";
 *       },
 *     },
 *   ],
 *   getPrompt: async (symbol, messages) => {
 *     // Generate strategy prompt from conversation
 *     return `"Analyze ${symbol} using RSI and MACD. Enter LONG when RSI < 30 and MACD crosses above signal."`;
 *   },
 *   callbacks: {
 *     onData: (symbol, strategyData) => {
 *       console.log(`Generated ${strategyData.length} strategies for ${symbol}`);
 *     },
 *     onCode: (symbol, code) => {
 *       console.log(`Generated ${code.length} characters of code for ${symbol}`);
 *     },
 *     onDump: (symbol, filepath) => {
 *       console.log(`Saved strategy to ${filepath}`);
 *     },
 *     onSourceData: (symbol, sourceName, data, startDate, endDate) => {
 *       console.log(`Fetched ${data.length} rows from ${sourceName} for ${symbol}`);
 *     },
 *   },
 * });
 * ```
 */
export function addOptimizerSchema(optimizerSchema: IOptimizerSchema) {
  engine.loggerService.info(ADD_OPTIMIZER_METHOD_NAME, {
    optimizerSchema,
  });
  engine.optimizerValidationService.addOptimizer(
    optimizerSchema.optimizerName,
    optimizerSchema
  );
  engine.optimizerSchemaService.register(
    optimizerSchema.optimizerName,
    optimizerSchema
  );
}
