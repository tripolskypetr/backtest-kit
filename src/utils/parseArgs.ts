import { parseArgs as parseArgsFn } from "util";

import { ExchangeName } from "src/interfaces/Exchange.interface";
import { FrameName } from "src/interfaces/Frame.interface";
import { StrategyName } from "src/interfaces/Strategy.interface";

/**
 * Input parameters for parseArgs function.
 * Defines the default values for command-line argument parsing.
 */
interface IParseArgsParams {
  /** Trading pair symbol (e.g., "BTCUSDT", "ETHUSDT") */
  symbol: string;
  /** Name of the trading strategy to execute */
  strategyName: StrategyName;
  /** Name of the exchange to connect to (e.g., "binance", "bybit") */
  exchangeName: ExchangeName;
  /** Timeframe for candle data (e.g., "1h", "15m", "1d") */
  frameName: FrameName;
}

/**
 * Result of parseArgs function.
 * Extends input parameters with trading mode flags parsed from command-line arguments.
 */
interface IParseArgsResult extends IParseArgsParams {
  /** Whether to run in backtest mode (historical data simulation) */
  backtest: boolean;
  /** Whether to run in paper trading mode (simulated trading with live data) */
  paper: boolean;
  /** Whether to run in live trading mode (real trading with real money) */
  live: boolean;
}

/**
 * Parses command-line arguments for trading bot configuration.
 *
 * Processes process.argv to extract trading parameters and mode flags.
 * Merges provided default values with command-line arguments.
 * Supports both backtest mode (historical simulation), paper trading mode
 * (simulated trading with live data), and live trading mode (real trading).
 *
 * Command-line options:
 * - --symbol: Trading pair symbol (e.g., "BTCUSDT")
 * - --strategy: Strategy name to use
 * - --exchange: Exchange name (e.g., "binance")
 * - --frame: Timeframe for candles (e.g., "1h", "15m")
 * - --backtest: Enable backtest mode (boolean flag)
 * - --paper: Enable paper trading mode (boolean flag)
 * - --live: Enable live trading mode (boolean flag)
 *
 * @param params - Optional default values for parameters
 * @param params.symbol - Default trading pair symbol
 * @param params.strategyName - Default strategy name
 * @param params.exchangeName - Default exchange name
 * @param params.frameName - Default timeframe
 * @returns Parsed configuration with all parameters and mode flags
 *
 * @example
 * ```typescript
 * // Parse args with defaults
 * const config = parseArgs({
 *   symbol: "BTCUSDT",
 *   strategyName: "rsi_divergence",
 *   exchangeName: "binance",
 *   frameName: "1h"
 * });
 *
 * // Command: node app.js --backtest
 * // Result: { symbol: "BTCUSDT", ..., backtest: true, paper: false, live: false }
 * ```
 */
export const parseArgs = ({
  symbol,
  strategyName,
  exchangeName,
  frameName,
}: Partial<IParseArgsParams> = {}): IParseArgsResult => {
  const { values } = parseArgsFn({
    args: process.argv,
    options: {
      symbol: {
        type: "string",
        default: symbol,
      },
      strategy: {
        type: "string",
        default: strategyName,
      },
      exchange: {
        type: "string",
        default: exchangeName,
      },
      frame: {
        type: "string",
        default: frameName,
      },
      backtest: {
        type: "boolean",
        default: false,
      },
      paper: {
        type: "boolean",
        default: false,
      },
      live: {
        type: "boolean",
        default: false,
      },
    },
    strict: false,
    allowPositionals: true,
  });
  return {
    symbol: String(values.symbol),
    strategyName: String(values.strategy),
    exchangeName: String(values.exchange),
    frameName: String(values.frame),
    backtest: Boolean(values.backtest),
    paper: Boolean(values.paper),
    live: Boolean(values.live),
  };
};
