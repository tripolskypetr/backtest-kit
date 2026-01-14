import History from "./History.contract";

/**
 * Type representing a report generation function for technical analysis.
 *
 * Standard signature for all report commit functions in the signals library.
 * Each function generates a specific type of market analysis (candle history,
 * technical indicators, order book data) and appends it to the history container
 * as formatted markdown.
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')
 * @param history - History container (message array or outline) to append report to
 * @returns Promise that resolves when report is successfully committed
 *
 * @example
 * ```typescript
 * import { commitMicroTermMath } from '@backtest-kit/signals';
 *
 * const messages = [];
 *
 * // Function signature matches ReportFn
 * await commitMicroTermMath('BTCUSDT', messages);
 *
 * // messages[0].content now contains 1-minute technical analysis table
 * ```
 */
export type ReportFn = (symbol: string, history: History) => Promise<void>;
