import { IStrategySchema } from "../interfaces/Strategy.interface";
import { IExchangeSchema } from "../interfaces/Exchange.interface";
import { IFrameSchema } from "../interfaces/Frame.interface";
import { IWalkerSchema } from "../interfaces/Walker.interface";
import { ISizingSchema } from "../interfaces/Sizing.interface";
import { IRiskSchema } from "../interfaces/Risk.interface";
import { IOptimizerSchema } from "../interfaces/Optimizer.interface";
import { IActionSchema } from "../interfaces/Action.interface";
import backtest from "../lib/index";

const METHOD_NAME_OVERRIDE_STRATEGY = "function.override.overrideStrategySchema";
const METHOD_NAME_OVERRIDE_EXCHANGE = "function.override.overrideExchangeSchema";
const METHOD_NAME_OVERRIDE_FRAME = "function.override.overrideFrameSchema";
const METHOD_NAME_OVERRIDE_WALKER = "function.override.overrideWalkerSchema";
const METHOD_NAME_OVERRIDE_SIZING = "function.override.overrideSizingSchema";
const METHOD_NAME_OVERRIDE_RISK = "function.override.overrideRiskSchema";
const METHOD_NAME_OVERRIDE_OPTIMIZER = "function.override.overrideOptimizerSchema";
const METHOD_NAME_OVERRIDE_ACTION = "function.override.overrideActionSchema";

/**
 * Partial strategy schema for override operations.
 *
 * Requires only the strategy name identifier, all other fields are optional.
 * Used by overrideStrategy() to perform partial updates without replacing entire configuration.
 *
 * @property strategyName - Required: Unique strategy identifier (must exist in registry)
 * @property interval - Optional: Signal generation interval to update
 * @property getSignal - Optional: New signal generation function
 * @property callbacks - Optional: Updated lifecycle callbacks
 *
 * @example
 * ```typescript
 * const partialUpdate: TStrategySchema = {
 *   strategyName: "my-strategy",
 *   interval: "15m" // Only update interval, keep other fields
 * };
 * ```
 */
type TStrategySchema = {
  strategyName: IStrategySchema["strategyName"];
} & Partial<IStrategySchema>;

/**
 * Partial exchange schema for override operations.
 *
 * Requires only the exchange name identifier, all other fields are optional.
 * Used by overrideExchange() to perform partial updates without replacing entire configuration.
 *
 * @property exchangeName - Required: Unique exchange identifier (must exist in registry)
 * @property getCandles - Optional: New candle data fetching function
 * @property formatPrice - Optional: Updated price formatting function
 * @property formatQuantity - Optional: Updated quantity formatting function
 * @property callbacks - Optional: Updated candle data callbacks
 *
 * @example
 * ```typescript
 * const partialUpdate: TExchangeSchema = {
 *   exchangeName: "binance",
 *   formatPrice: async (symbol, price) => price.toFixed(4) // Only update price formatter
 * };
 * ```
 */
type TExchangeSchema = {
  exchangeName: IExchangeSchema["exchangeName"];
} & Partial<IExchangeSchema>;

/**
 * Partial frame schema for override operations.
 *
 * Requires only the frame name identifier, all other fields are optional.
 * Used by overrideFrame() to perform partial updates without replacing entire configuration.
 *
 * @property frameName - Required: Unique frame identifier (must exist in registry)
 * @property interval - Optional: New timeframe interval
 * @property startDate - Optional: Updated start date for backtesting
 * @property endDate - Optional: Updated end date for backtesting
 * @property callbacks - Optional: Updated timeframe callbacks
 *
 * @example
 * ```typescript
 * const partialUpdate: TFrameSchema = {
 *   frameName: "1d-backtest",
 *   endDate: new Date("2024-12-31") // Only extend end date
 * };
 * ```
 */
type TFrameSchema = {
  frameName: IFrameSchema["frameName"];
} & Partial<IFrameSchema>;

/**
 * Partial walker schema for override operations.
 *
 * Requires only the walker name identifier, all other fields are optional.
 * Used by overrideWalker() to perform partial updates without replacing entire configuration.
 *
 * @property walkerName - Required: Unique walker identifier (must exist in registry)
 * @property exchangeName - Optional: New exchange to use
 * @property frameName - Optional: New timeframe to use
 * @property strategies - Optional: Updated list of strategies to compare
 * @property metric - Optional: New optimization metric
 * @property callbacks - Optional: Updated walker callbacks
 *
 * @example
 * ```typescript
 * const partialUpdate: TWalkerSchema = {
 *   walkerName: "optimizer",
 *   metric: "profitFactor" // Only change metric
 * };
 * ```
 */
type TWalkerSchema = {
  walkerName: IWalkerSchema["walkerName"];
} & Partial<IWalkerSchema>;

/**
 * Partial sizing schema for override operations.
 *
 * Requires only the sizing name identifier, all other fields are optional.
 * Used by overrideSizing() to perform partial updates without replacing entire configuration.
 *
 * @property sizingName - Required: Unique sizing identifier (must exist in registry)
 * @property method - Optional: New sizing method ("fixed-percentage" | "kelly-criterion" | "atr-based")
 * @property riskPercentage - Optional: Updated risk percentage per trade
 * @property kellyMultiplier - Optional: Updated Kelly multiplier (for kelly-criterion)
 * @property atrMultiplier - Optional: Updated ATR multiplier (for atr-based)
 * @property maxPositionPercentage - Optional: New max position size limit
 * @property minPositionSize - Optional: New minimum position size
 * @property maxPositionSize - Optional: New maximum position size
 * @property callbacks - Optional: Updated sizing callbacks
 *
 * @example
 * ```typescript
 * const partialUpdate: TSizingSchema = {
 *   sizingName: "conservative",
 *   riskPercentage: 2 // Only increase risk from 1% to 2%
 * };
 * ```
 */
type TSizingSchema = {
  sizingName: ISizingSchema["sizingName"];
} & Partial<ISizingSchema>;

/**
 * Partial risk schema for override operations.
 *
 * Requires only the risk name identifier, all other fields are optional.
 * Used by overrideRisk() to perform partial updates without replacing entire configuration.
 *
 * @property riskName - Required: Unique risk profile identifier (must exist in registry)
 * @property maxConcurrentPositions - Optional: New max concurrent positions limit
 * @property validations - Optional: Updated custom validation functions
 * @property callbacks - Optional: Updated risk management callbacks
 *
 * @example
 * ```typescript
 * const partialUpdate: TRiskSchema = {
 *   riskName: "conservative",
 *   maxConcurrentPositions: 3 // Only reduce max positions from 5 to 3
 * };
 * ```
 */
type TRiskSchema = {
  riskName: IRiskSchema["riskName"];
} & Partial<IRiskSchema>;

/**
 * Partial optimizer schema for override operations.
 *
 * Requires only the optimizer name identifier, all other fields are optional.
 * Used by overrideOptimizer() to perform partial updates without replacing entire configuration.
 *
 * @property optimizerName - Required: Unique optimizer identifier (must exist in registry)
 * @property rangeTrain - Optional: Updated training time ranges
 * @property rangeTest - Optional: Updated testing time range
 * @property source - Optional: Updated data sources array
 * @property getPrompt - Optional: New prompt generation function
 * @property template - Optional: Updated template overrides
 * @property callbacks - Optional: Updated optimizer callbacks
 *
 * @example
 * ```typescript
 * const partialUpdate: TOptimizerSchema = {
 *   optimizerName: "llm-strategy-gen",
 *   rangeTest: {
 *     note: "Extended test period",
 *     startDate: new Date("2024-04-01"),
 *     endDate: new Date("2024-06-30")
 *   }
 * };
 * ```
 */
type TOptimizerSchema = {
  optimizerName: IOptimizerSchema["optimizerName"];
} & Partial<IOptimizerSchema>;

/**
 * Partial action schema for override operations.
 *
 * Requires only the action name identifier, all other fields are optional.
 * Used by overrideAction() to perform partial updates without replacing entire configuration.
 *
 * @property actionName - Required: Unique action identifier (must exist in registry)
 * @property handler - Optional: New action handler class or plain object
 * @property callbacks - Optional: Updated lifecycle callbacks
 *
 * @example
 * ```typescript
 * const partialUpdate: TActionSchema = {
 *   actionName: "telegram-notifier",
 *   callbacks: {
 *     onSignal: (event, actionName, strategyName, frameName, backtest) => {
 *       console.log(`[UPDATED] ${event.action}`); // Only update signal callback
 *     }
 *   }
 * };
 * ```
 */
type TActionSchema = {
  actionName: IActionSchema["actionName"];
} & Partial<IActionSchema>;

/**
 * Overrides an existing trading strategy in the framework.
 *
 * This function partially updates a previously registered strategy with new configuration.
 * Only the provided fields will be updated, other fields remain unchanged.
 *
 * @param strategySchema - Partial strategy configuration object
 * @param strategySchema.strategyName - Unique strategy identifier (must exist)
 * @param strategySchema.interval - Optional: Signal generation interval
 * @param strategySchema.getSignal - Optional: Async function that generates trading signals
 * @param strategySchema.callbacks - Optional: Lifecycle callbacks (onOpen, onClose)
 *
 * @example
 * ```typescript
 * overrideStrategy({
 *   strategyName: "my-strategy",
 *   interval: "15m", // Only update interval
 * });
 * ```
 */
export async function overrideStrategySchema(strategySchema: TStrategySchema) {
  backtest.loggerService.log(METHOD_NAME_OVERRIDE_STRATEGY, {
    strategySchema,
  });

  await backtest.strategyValidationService.validate(
    strategySchema.strategyName,
    METHOD_NAME_OVERRIDE_STRATEGY
  );

  return backtest.strategySchemaService.override(
    strategySchema.strategyName,
    strategySchema
  );
}

/**
 * Overrides an existing exchange data source in the framework.
 *
 * This function partially updates a previously registered exchange with new configuration.
 * Only the provided fields will be updated, other fields remain unchanged.
 *
 * @param exchangeSchema - Partial exchange configuration object
 * @param exchangeSchema.exchangeName - Unique exchange identifier (must exist)
 * @param exchangeSchema.getCandles - Optional: Async function to fetch candle data
 * @param exchangeSchema.formatPrice - Optional: Async function to format prices
 * @param exchangeSchema.formatQuantity - Optional: Async function to format quantities
 * @param exchangeSchema.callbacks - Optional: Callback for candle data events
 *
 * @example
 * ```typescript
 * overrideExchange({
 *   exchangeName: "binance",
 *   formatPrice: async (symbol, price) => price.toFixed(4), // Only update price formatting
 * });
 * ```
 */
export async function overrideExchangeSchema(exchangeSchema: TExchangeSchema) {
  backtest.loggerService.log(METHOD_NAME_OVERRIDE_EXCHANGE, {
    exchangeSchema,
  });

  await backtest.exchangeValidationService.validate(
    exchangeSchema.exchangeName,
    METHOD_NAME_OVERRIDE_EXCHANGE
  );

  return backtest.exchangeSchemaService.override(
    exchangeSchema.exchangeName,
    exchangeSchema
  );
}

/**
 * Overrides an existing timeframe configuration for backtesting.
 *
 * This function partially updates a previously registered frame with new configuration.
 * Only the provided fields will be updated, other fields remain unchanged.
 *
 * @param frameSchema - Partial frame configuration object
 * @param frameSchema.frameName - Unique frame identifier (must exist)
 * @param frameSchema.interval - Optional: Timeframe interval
 * @param frameSchema.startDate - Optional: Start date for timeframe generation
 * @param frameSchema.endDate - Optional: End date for timeframe generation
 * @param frameSchema.callbacks - Optional: Callback for timeframe events
 *
 * @example
 * ```typescript
 * overrideFrame({
 *   frameName: "1d-backtest",
 *   endDate: new Date("2024-03-01T00:00:00Z"), // Only extend end date
 * });
 * ```
 */
export async function overrideFrameSchema(frameSchema: TFrameSchema) {
  backtest.loggerService.log(METHOD_NAME_OVERRIDE_FRAME, {
    frameSchema,
  });

  await backtest.frameValidationService.validate(
    frameSchema.frameName,
    METHOD_NAME_OVERRIDE_FRAME
  );

  return backtest.frameSchemaService.override(
    frameSchema.frameName,
    frameSchema
  );
}

/**
 * Overrides an existing walker configuration for strategy comparison.
 *
 * This function partially updates a previously registered walker with new configuration.
 * Only the provided fields will be updated, other fields remain unchanged.
 *
 * @param walkerSchema - Partial walker configuration object
 * @param walkerSchema.walkerName - Unique walker identifier (must exist)
 * @param walkerSchema.exchangeName - Optional: Exchange to use for all strategies
 * @param walkerSchema.frameName - Optional: Timeframe to use for all strategies
 * @param walkerSchema.strategies - Optional: Array of strategy names to compare
 * @param walkerSchema.metric - Optional: Metric to optimize
 * @param walkerSchema.callbacks - Optional: Lifecycle callbacks
 *
 * @example
 * ```typescript
 * overrideWalker({
 *   walkerName: "llm-prompt-optimizer",
 *   metric: "profitFactor", // Only change metric
 * });
 * ```
 */
export async function overrideWalkerSchema(walkerSchema: TWalkerSchema) {
  backtest.loggerService.log(METHOD_NAME_OVERRIDE_WALKER, {
    walkerSchema,
  });

  await backtest.walkerValidationService.validate(
    walkerSchema.walkerName,
    METHOD_NAME_OVERRIDE_WALKER
  );

  return backtest.walkerSchemaService.override(
    walkerSchema.walkerName,
    walkerSchema
  );
}

/**
 * Overrides an existing position sizing configuration in the framework.
 *
 * This function partially updates a previously registered sizing configuration with new settings.
 * Only the provided fields will be updated, other fields remain unchanged.
 *
 * @param sizingSchema - Partial sizing configuration object
 * @param sizingSchema.sizingName - Unique sizing identifier (must exist)
 * @param sizingSchema.method - Optional: Sizing method
 * @param sizingSchema.riskPercentage - Optional: Risk percentage per trade
 * @param sizingSchema.kellyMultiplier - Optional: Kelly multiplier
 * @param sizingSchema.atrMultiplier - Optional: ATR multiplier
 * @param sizingSchema.maxPositionPercentage - Optional: Max position size as % of account
 * @param sizingSchema.minPositionSize - Optional: Minimum position size
 * @param sizingSchema.maxPositionSize - Optional: Maximum position size
 * @param sizingSchema.callbacks - Optional: Lifecycle callbacks
 *
 * @example
 * ```typescript
 * overrideSizing({
 *   sizingName: "conservative",
 *   riskPercentage: 2, // Only increase risk percentage
 * });
 * ```
 */
export async function overrideSizingSchema(sizingSchema: TSizingSchema) {
  backtest.loggerService.log(METHOD_NAME_OVERRIDE_SIZING, {
    sizingSchema,
  });

  await backtest.sizingValidationService.validate(
    sizingSchema.sizingName,
    METHOD_NAME_OVERRIDE_SIZING
  );

  return backtest.sizingSchemaService.override(
    sizingSchema.sizingName,
    sizingSchema
  );
}

/**
 * Overrides an existing risk management configuration in the framework.
 *
 * This function partially updates a previously registered risk configuration with new settings.
 * Only the provided fields will be updated, other fields remain unchanged.
 *
 * @param riskSchema - Partial risk configuration object
 * @param riskSchema.riskName - Unique risk profile identifier (must exist)
 * @param riskSchema.maxConcurrentPositions - Optional: Max number of open positions
 * @param riskSchema.validations - Optional: Custom validation functions
 * @param riskSchema.callbacks - Optional: Lifecycle callbacks
 *
 * @example
 * ```typescript
 * overrideRisk({
 *   riskName: "conservative",
 *   maxConcurrentPositions: 3, // Only reduce max positions
 * });
 * ```
 */
export async function overrideRiskSchema(riskSchema: TRiskSchema) {
  backtest.loggerService.log(METHOD_NAME_OVERRIDE_RISK, {
    riskSchema,
  });

  await backtest.riskValidationService.validate(
    riskSchema.riskName,
    METHOD_NAME_OVERRIDE_RISK
  );

  return backtest.riskSchemaService.override(
    riskSchema.riskName,
    riskSchema
  );
}

/**
 * Overrides an existing optimizer configuration in the framework.
 *
 * This function partially updates a previously registered optimizer with new configuration.
 * Only the provided fields will be updated, other fields remain unchanged.
 *
 * @param optimizerSchema - Partial optimizer configuration object
 * @param optimizerSchema.optimizerName - Unique optimizer identifier (must exist)
 * @param optimizerSchema.rangeTrain - Optional: Array of training time ranges
 * @param optimizerSchema.rangeTest - Optional: Testing time range
 * @param optimizerSchema.source - Optional: Array of data sources
 * @param optimizerSchema.getPrompt - Optional: Function to generate strategy prompt
 * @param optimizerSchema.template - Optional: Custom template overrides
 * @param optimizerSchema.callbacks - Optional: Lifecycle callbacks
 *
 * @example
 * ```typescript
 * overrideOptimizer({
 *   optimizerName: "llm-strategy-generator",
 *   rangeTest: {
 *     note: "Updated validation period",
 *     startDate: new Date("2024-04-01"),
 *     endDate: new Date("2024-04-30"),
 *   },
 * });
 * ```
 */
export async function overrideOptimizerSchema(optimizerSchema: TOptimizerSchema) {
  backtest.loggerService.log(METHOD_NAME_OVERRIDE_OPTIMIZER, {
    optimizerSchema,
  });

  await backtest.optimizerValidationService.validate(
    optimizerSchema.optimizerName,
    METHOD_NAME_OVERRIDE_OPTIMIZER
  );

  return backtest.optimizerSchemaService.override(
    optimizerSchema.optimizerName,
    optimizerSchema
  );
}

/**
 * Overrides an existing action handler configuration in the framework.
 *
 * This function partially updates a previously registered action handler with new configuration.
 * Only the provided fields will be updated, other fields remain unchanged.
 *
 * Useful for:
 * - Updating event handler logic without re-registering
 * - Modifying callbacks for different environments (dev/prod)
 * - Switching handler implementations dynamically
 * - Adjusting action behavior without strategy changes
 *
 * @param actionSchema - Partial action configuration object
 * @param actionSchema.actionName - Unique action identifier (must exist)
 * @param actionSchema.handler - Optional: Action handler class constructor or plain object
 * @param actionSchema.callbacks - Optional: Lifecycle callbacks to update
 *
 * @example
 * ```typescript
 * // Override handler implementation
 * class ImprovedTelegramNotifier implements Partial<IPublicAction> {
 *   constructor(
 *     private strategyName: StrategyName,
 *     private frameName: FrameName,
 *     private actionName: ActionName
 *   ) {}
 *
 *   async signal(event: IStrategyTickResult) {
 *     if (event.action === 'opened') {
 *       await this.bot.send(`📈 ${event.signal.side} signal opened`); // Enhanced formatting
 *     }
 *   }
 * }
 *
 * overrideAction({
 *   actionName: "telegram-notifier",
 *   handler: ImprovedTelegramNotifier, // Only update handler
 * });
 *
 * // Override only callbacks
 * overrideAction({
 *   actionName: "telegram-notifier",
 *   callbacks: {
 *     onSignal: (event, actionName, strategyName, frameName, backtest) => {
 *       console.log(`[VERBOSE] ${actionName}: ${event.action}`); // More verbose logging
 *     },
 *   },
 * });
 *
 * // Update plain object handler
 * overrideAction({
 *   actionName: "simple-logger",
 *   handler: {
 *     signal: (event) => console.log('📊 Signal:', event.action),
 *     breakeven: (event) => console.log('⚖️ Breakeven triggered'),
 *     partialProfit: (event) => console.log('💰 Partial profit:', event.level),
 *   },
 * });
 * ```
 */
export async function overrideActionSchema(actionSchema: TActionSchema) {
  backtest.loggerService.log(METHOD_NAME_OVERRIDE_ACTION, {
    actionSchema,
  });

  await backtest.actionValidationService.validate(
    actionSchema.actionName,
    METHOD_NAME_OVERRIDE_ACTION
  );

  return backtest.actionSchemaService.override(
    actionSchema.actionName,
    actionSchema
  );
}
