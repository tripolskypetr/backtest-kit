import backtest from "../lib/index";
import { IStrategySchema } from "../interfaces/Strategy.interface";
import { IExchangeSchema } from "../interfaces/Exchange.interface";
import { IFrameSchema } from "../interfaces/Frame.interface";
import { IWalkerSchema } from "../interfaces/Walker.interface";
import { ISizingSchema } from "../interfaces/Sizing.interface";
import { IRiskSchema } from "../interfaces/Risk.interface";

const ADD_STRATEGY_METHOD_NAME = "add.addStrategy";
const ADD_EXCHANGE_METHOD_NAME = "add.addExchange";
const ADD_FRAME_METHOD_NAME = "add.addFrame";
const ADD_WALKER_METHOD_NAME = "add.addWalker";
const ADD_SIZING_METHOD_NAME = "add.addSizing";
const ADD_RISK_METHOD_NAME = "add.addRisk";

/**
 * Registers a trading strategy in the framework.
 *
 * The strategy will be validated for:
 * - Signal validation (prices, TP/SL logic, timestamps)
 * - Interval throttling (prevents signal spam)
 * - Crash-safe persistence in live mode
 *
 * @param strategySchema - Strategy configuration object
 * @param strategySchema.strategyName - Unique strategy identifier
 * @param strategySchema.interval - Signal generation interval ("1m" | "3m" | "5m" | "15m" | "30m" | "1h")
 * @param strategySchema.getSignal - Async function that generates trading signals
 * @param strategySchema.callbacks - Optional lifecycle callbacks (onOpen, onClose)
 *
 * @example
 * ```typescript
 * addStrategy({
 *   strategyName: "my-strategy",
 *   interval: "5m",
 *   getSignal: async (symbol) => ({
 *     position: "long",
 *     priceOpen: 50000,
 *     priceTakeProfit: 51000,
 *     priceStopLoss: 49000,
 *     minuteEstimatedTime: 60,
 *     timestamp: Date.now(),
 *   }),
 *   callbacks: {
 *     onOpen: (symbol, signal, currentPrice, backtest) => console.log("Signal opened"),
 *     onClose: (symbol, signal, priceClose, backtest) => console.log("Signal closed"),
 *   },
 * });
 * ```
 */
export function addStrategy(strategySchema: IStrategySchema) {
  backtest.loggerService.info(ADD_STRATEGY_METHOD_NAME, {
    strategySchema,
  });
  backtest.strategyValidationService.addStrategy(
    strategySchema.strategyName,
    strategySchema
  );
  backtest.strategySchemaService.register(
    strategySchema.strategyName,
    strategySchema
  );
}

/**
 * Registers an exchange data source in the framework.
 *
 * The exchange provides:
 * - Historical candle data via getCandles
 * - Price/quantity formatting for the exchange
 * - VWAP calculation from last 5 1m candles
 *
 * @param exchangeSchema - Exchange configuration object
 * @param exchangeSchema.exchangeName - Unique exchange identifier
 * @param exchangeSchema.getCandles - Async function to fetch candle data
 * @param exchangeSchema.formatPrice - Async function to format prices
 * @param exchangeSchema.formatQuantity - Async function to format quantities
 * @param exchangeSchema.callbacks - Optional callback for candle data events
 *
 * @example
 * ```typescript
 * addExchange({
 *   exchangeName: "binance",
 *   getCandles: async (symbol, interval, since, limit) => {
 *     // Fetch from Binance API or database
 *     return [{
 *       timestamp: Date.now(),
 *       open: 50000,
 *       high: 51000,
 *       low: 49000,
 *       close: 50500,
 *       volume: 1000,
 *     }];
 *   },
 *   formatPrice: async (symbol, price) => price.toFixed(2),
 *   formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
 * });
 * ```
 */
export function addExchange(exchangeSchema: IExchangeSchema) {
  backtest.loggerService.info(ADD_EXCHANGE_METHOD_NAME, {
    exchangeSchema,
  });
  backtest.exchangeValidationService.addExchange(
    exchangeSchema.exchangeName,
    exchangeSchema
  );
  backtest.exchangeSchemaService.register(
    exchangeSchema.exchangeName,
    exchangeSchema
  );
}

/**
 * Registers a timeframe generator for backtesting.
 *
 * The frame defines:
 * - Start and end dates for backtest period
 * - Interval for timeframe generation
 * - Callback for timeframe generation events
 *
 * @param frameSchema - Frame configuration object
 * @param frameSchema.frameName - Unique frame identifier
 * @param frameSchema.interval - Timeframe interval ("1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d")
 * @param frameSchema.startDate - Start date for timeframe generation
 * @param frameSchema.endDate - End date for timeframe generation
 * @param frameSchema.callbacks - Optional callback for timeframe events
 *
 * @example
 * ```typescript
 * addFrame({
 *   frameName: "1d-backtest",
 *   interval: "1m",
 *   startDate: new Date("2024-01-01T00:00:00Z"),
 *   endDate: new Date("2024-01-02T00:00:00Z"),
 *   callbacks: {
 *     onTimeframe: (timeframe, startDate, endDate, interval) => {
 *       console.log(`Generated ${timeframe.length} timeframes`);
 *     },
 *   },
 * });
 * ```
 */
export function addFrame(frameSchema: IFrameSchema) {
  backtest.loggerService.info(ADD_FRAME_METHOD_NAME, {
    frameSchema,
  });
  backtest.frameValidationService.addFrame(frameSchema.frameName, frameSchema);
  backtest.frameSchemaService.register(frameSchema.frameName, frameSchema);
}

/**
 * Registers a walker for strategy comparison.
 *
 * The walker executes backtests for multiple strategies on the same
 * historical data and compares their performance using a specified metric.
 *
 * @param walkerSchema - Walker configuration object
 * @param walkerSchema.walkerName - Unique walker identifier
 * @param walkerSchema.exchangeName - Exchange to use for all strategies
 * @param walkerSchema.frameName - Timeframe to use for all strategies
 * @param walkerSchema.strategies - Array of strategy names to compare
 * @param walkerSchema.metric - Metric to optimize (default: "sharpeRatio")
 * @param walkerSchema.callbacks - Optional lifecycle callbacks
 *
 * @example
 * ```typescript
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
  backtest.loggerService.info(ADD_WALKER_METHOD_NAME, {
    walkerSchema,
  });
  backtest.walkerValidationService.addWalker(
    walkerSchema.walkerName,
    walkerSchema
  );
  backtest.walkerSchemaService.register(
    walkerSchema.walkerName,
    walkerSchema
  );
}

/**
 * Registers a position sizing configuration in the framework.
 *
 * The sizing configuration defines:
 * - Position sizing method (fixed-percentage, kelly-criterion, atr-based)
 * - Risk parameters (risk percentage, Kelly multiplier, ATR multiplier)
 * - Position constraints (min/max size, max position percentage)
 * - Callback for calculation events
 *
 * @param sizingSchema - Sizing configuration object (discriminated union)
 * @param sizingSchema.sizingName - Unique sizing identifier
 * @param sizingSchema.method - Sizing method ("fixed-percentage" | "kelly-criterion" | "atr-based")
 * @param sizingSchema.riskPercentage - Risk percentage per trade (for fixed-percentage and atr-based)
 * @param sizingSchema.kellyMultiplier - Kelly multiplier (for kelly-criterion, default: 0.25)
 * @param sizingSchema.atrMultiplier - ATR multiplier (for atr-based, default: 2)
 * @param sizingSchema.maxPositionPercentage - Optional max position size as % of account
 * @param sizingSchema.minPositionSize - Optional minimum position size
 * @param sizingSchema.maxPositionSize - Optional maximum position size
 * @param sizingSchema.callbacks - Optional lifecycle callbacks
 *
 * @example
 * ```typescript
 * // Fixed percentage sizing
 * addSizing({
 *   sizingName: "conservative",
 *   method: "fixed-percentage",
 *   riskPercentage: 1,
 *   maxPositionPercentage: 10,
 * });
 *
 * // Kelly Criterion sizing
 * addSizing({
 *   sizingName: "kelly",
 *   method: "kelly-criterion",
 *   kellyMultiplier: 0.25,
 *   maxPositionPercentage: 20,
 * });
 *
 * // ATR-based sizing
 * addSizing({
 *   sizingName: "atr-dynamic",
 *   method: "atr-based",
 *   riskPercentage: 2,
 *   atrMultiplier: 2,
 *   callbacks: {
 *     onCalculate: (quantity, params) => {
 *       console.log(`Calculated size: ${quantity} for ${params.symbol}`);
 *     },
 *   },
 * });
 * ```
 */
export function addSizing(sizingSchema: ISizingSchema) {
  backtest.loggerService.info(ADD_SIZING_METHOD_NAME, {
    sizingSchema,
  });
  backtest.sizingValidationService.addSizing(
    sizingSchema.sizingName,
    sizingSchema
  );
  backtest.sizingSchemaService.register(
    sizingSchema.sizingName,
    sizingSchema
  );
}

/**
 * Registers a risk management configuration in the framework.
 *
 * The risk configuration defines:
 * - Maximum concurrent positions across all strategies
 * - Custom validations for advanced risk logic (portfolio metrics, correlations, etc.)
 * - Callbacks for rejected/allowed signals
 *
 * Multiple ClientStrategy instances share the same ClientRisk instance,
 * enabling cross-strategy risk analysis. ClientRisk tracks all active positions
 * and provides access to them via validation functions.
 *
 * @param riskSchema - Risk configuration object
 * @param riskSchema.riskName - Unique risk profile identifier
 * @param riskSchema.maxConcurrentPositions - Optional max number of open positions across all strategies
 * @param riskSchema.validations - Optional custom validation functions with access to params and active positions
 * @param riskSchema.callbacks - Optional lifecycle callbacks (onRejected, onAllowed)
 *
 * @example
 * ```typescript
 * // Basic risk limit
 * addRisk({
 *   riskName: "conservative",
 *   maxConcurrentPositions: 5,
 * });
 *
 * // With custom validations (access to signal data and portfolio state)
 * addRisk({
 *   riskName: "advanced",
 *   maxConcurrentPositions: 10,
 *   validations: [
 *     {
 *       validate: async ({ params }) => {
 *         // params contains: symbol, strategyName, exchangeName, signal, currentPrice, timestamp
 *         // Calculate portfolio metrics from external data source
 *         const portfolio = await getPortfolioState();
 *         if (portfolio.drawdown > 20) {
 *           throw new Error("Portfolio drawdown exceeds 20%");
 *         }
 *       },
 *       docDescription: "Prevents trading during high drawdown",
 *     },
 *     ({ params }) => {
 *       // Access signal details
 *       const positionValue = calculatePositionValue(params.signal, params.currentPrice);
 *       if (positionValue > 10000) {
 *         throw new Error("Position value exceeds $10,000 limit");
 *       }
 *     },
 *   ],
 *   callbacks: {
 *     onRejected: (symbol, reason, limit, params) => {
 *       console.log(`[RISK] Signal rejected for ${symbol}: ${reason}`);
 *     },
 *     onAllowed: (symbol, params) => {
 *       console.log(`[RISK] Signal allowed for ${symbol}`);
 *     },
 *   },
 * });
 * ```
 */
export function addRisk(riskSchema: IRiskSchema) {
  backtest.loggerService.info(ADD_RISK_METHOD_NAME, {
    riskSchema,
  });
  backtest.riskValidationService.addRisk(
    riskSchema.riskName,
    riskSchema
  );
  backtest.riskSchemaService.register(
    riskSchema.riskName,
    riskSchema
  );
}
