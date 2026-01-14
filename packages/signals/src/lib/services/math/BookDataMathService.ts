/**
 * Order book analysis service for real-time market depth and liquidity assessment.
 *
 * Generates comprehensive order book reports including:
 * - Top 20 bid/ask levels sorted by volume percentage
 * - Best bid/ask prices
 * - Mid price and spread
 * - Depth imbalance (buy vs sell pressure indicator)
 *
 * Depth Imbalance Formula:
 * (Total Bid Volume - Total Ask Volume) / (Total Bid Volume + Total Ask Volume)
 * - Positive: Buy pressure (more bids)
 * - Negative: Sell pressure (more asks)
 * - Zero: Balanced market
 *
 * Used by commitBookDataReport() for LLM context injection.
 * Only available in live mode (skipped in backtest mode).
 */

import { ttl } from "functools-kit";
import { formatPrice, formatQuantity, getOrderBook, IBidData, getDate } from "backtest-kit";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

/**
 * Maximum order book depth levels to fetch for accurate metrics.
 * Provides comprehensive liquidity view for depth imbalance calculation.
 */
const MAX_DEPTH_LEVELS = 1000;

/**
 * Validates whether a numeric value is safe for calculations.
 *
 * Checks if value is a valid finite number. Returns true if value is null,
 * NaN, Infinity, or not a number type.
 *
 * @param value - Value to validate
 * @returns True if value is unsafe (null/NaN/Infinity), false if valid number
 *
 * @example
 * ```typescript
 * isUnsafe(42) // false - valid number
 * isUnsafe(null) // true - null value
 * isUnsafe(NaN) // true - not a number
 * isUnsafe(Infinity) // true - infinite value
 * ```
 */
function isUnsafe(value: number | null) {
  if (typeof value !== "number") {
    return true;
  }
  if (isNaN(value)) {
    return true;
  }
  if (!isFinite(value)) {
    return true;
  }
  return false;
}

/**
 * Order book entry with volume percentage.
 */
interface IOrderBookEntry {
  /** Price level */
  price: number;
  /** Total quantity at this price */
  quantity: number;
  /** Percentage of total side volume */
  percentage: number;
}

/**
 * Complete order book analysis result.
 */
export interface IBookDataAnalysis {
  /** Trading pair symbol */
  symbol: string;
  /** Analysis timestamp */
  timestamp: string;
  /** Bid (buy) levels with percentages */
  bids: IOrderBookEntry[];
  /** Ask (sell) levels with percentages */
  asks: IOrderBookEntry[];
  /** Highest bid price */
  bestBid: number;
  /** Lowest ask price */
  bestAsk: number;
  /** Mid price: (bestBid + bestAsk) / 2 */
  midPrice: number;
  /** Spread: bestAsk - bestBid */
  spread: number;
  /** Depth imbalance: (bidVol - askVol) / (bidVol + askVol) */
  depthImbalance: number;
}

/**
 * Processes one side of order book (bids or asks) and calculates volume percentages.
 *
 * Converts raw bid/ask data to structured entries with volume percentage calculations.
 * Each entry's percentage represents its share of total side volume.
 *
 * @param orders - Raw order book entries from exchange API
 * @returns Processed entries with price, quantity, and volume percentage
 *
 * @example
 * ```typescript
 * const rawBids = [
 *   { price: "42000", quantity: "1.5" },
 *   { price: "41999", quantity: "0.5" }
 * ];
 * const processed = processOrderBookSide(rawBids);
 * // [
 * //   { price: 42000, quantity: 1.5, percentage: 75.0 },
 * //   { price: 41999, quantity: 0.5, percentage: 25.0 }
 * // ]
 * ```
 */
function processOrderBookSide(orders: IBidData[]): IOrderBookEntry[] {
  const entries = orders.map((order) => ({
    price: parseFloat(order.price),
    quantity: parseFloat(order.quantity),
    percentage: 0,
  }));

  // Calculate percentages
  const totalVolume = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  entries.forEach((entry) => {
    entry.percentage =
      totalVolume > 0 ? (entry.quantity / totalVolume) * 100 : 0;
  });

  return entries;
}

/**
 * Generates markdown-formatted order book report with depth analysis.
 *
 * Creates comprehensive markdown report including:
 * - Order book summary (best bid/ask, mid price, spread, depth imbalance)
 * - Top 20 bid levels sorted by volume percentage
 * - Top 20 ask levels sorted by volume percentage
 * - Formatted prices and quantities with proper USD notation
 *
 * Output is optimized for LLM consumption in trading signal generation.
 *
 * @param self - Service instance for logging context
 * @param result - Order book analysis data with calculated metrics
 * @returns Markdown-formatted order book report
 *
 * @example
 * ```typescript
 * const analysis = await service.getData('BTCUSDT');
 * const report = await generateBookDataReport(service, analysis);
 * console.log(report);
 * // # Order Book Analysis for BTCUSDT
 * // > Current time: 2025-01-14T10:30:00.000Z
 * // ## Order Book Summary
 * // - **Best Bid**: 42000.50 USD
 * // - **Best Ask**: 42001.25 USD
 * // - **Depth Imbalance**: 12.5%
 * ```
 */
const generateBookDataReport = async (
  self: BookDataMathService,
  result: IBookDataAnalysis
): Promise<string> => {
  const currentData = await getDate();
  let markdown = `# Order Book Analysis for ${result.symbol}\n`;
  markdown += `> Current time: ${currentData.toISOString()}\n\n`;

  // Basic order book info
  markdown += `## Order Book Summary\n`;
  markdown += `- **Best Bid**: ${
    !isUnsafe(result.bestBid)
      ? (await formatPrice(result.symbol, result.bestBid)) + " USD"
      : "N/A"
  }\n`;
  markdown += `- **Best Ask**: ${
    !isUnsafe(result.bestAsk)
      ? (await formatPrice(result.symbol, result.bestAsk)) + " USD"
      : "N/A"
  }\n`;
  markdown += `- **Mid Price**: ${
    !isUnsafe(result.midPrice)
      ? (await formatPrice(result.symbol, result.midPrice)) + " USD"
      : "N/A"
  }\n`;
  markdown += `- **Spread**: ${
    !isUnsafe(result.spread)
      ? (await formatPrice(result.symbol, result.spread)) + " USD"
      : "N/A"
  }\n`;
  markdown += `- **Depth Imbalance**: ${
    !isUnsafe(result.depthImbalance)
      ? (result.depthImbalance * 100).toFixed(1) + "%"
      : "N/A"
  }\n\n`;

  // Top order book levels
  markdown += `## Top 20 Order Book Levels\n\n`;
  markdown += `### Bids (Buy Orders)\n`;
  markdown += `| Price | Quantity | % of Total |\n`;
  markdown += `|-------|----------|------------|\n`;

  // Sort bids by percentage (descending) and take top 20
  const topBids = [...result.bids]
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 20);

  for (const bid of topBids) {
    const priceStr = !isUnsafe(bid.price)
      ? await formatPrice(result.symbol, bid.price)
      : "N/A";
    const quantityStr = !isUnsafe(bid.quantity)
      ? await formatQuantity(result.symbol, bid.quantity)
      : "N/A";
    const percentageStr = !isUnsafe(bid.percentage)
      ? bid.percentage.toFixed(1) + "%"
      : "N/A";

    markdown += `| ${priceStr} | ${quantityStr} | ${percentageStr} |\n`;
  }

  markdown += `\n### Asks (Sell Orders)\n`;
  markdown += `| Price | Quantity | % of Total |\n`;
  markdown += `|-------|----------|------------|\n`;

  // Sort asks by percentage (descending) and take top 20
  const topAsks = [...result.asks]
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 20);

  for (const ask of topAsks) {
    const priceStr = !isUnsafe(ask.price)
      ? await formatPrice(result.symbol, ask.price)
      : "N/A";
    const quantityStr = !isUnsafe(ask.quantity)
      ? await formatQuantity(result.symbol, ask.quantity)
      : "N/A";
    const percentageStr = !isUnsafe(ask.percentage)
      ? ask.percentage.toFixed(1) + "%"
      : "N/A";

    markdown += `| ${priceStr} | ${quantityStr} | ${percentageStr} |\n`;
  }

  markdown += `\n`;

  return markdown;
};

/**
 * Service for order book analysis and markdown report generation.
 *
 * Provides real-time order book depth analysis with market liquidity metrics
 * including bid/ask levels, depth imbalance, spread, and volume distribution.
 *
 * Key features:
 * - Fetches up to 1000 order book depth levels
 * - Calculates best bid/ask, mid price, and spread
 * - Computes depth imbalance (buy vs sell pressure)
 * - Analyzes volume distribution with percentage calculations
 * - Generates markdown reports with top 20 levels
 * - Only available in live mode (skipped in backtest)
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { BookDataMathService } from '@backtest-kit/signals';
 *
 * const service = new BookDataMathService();
 *
 * // Get markdown report (fetches order book internally)
 * const report = await service.getReport('BTCUSDT');
 * console.log(report); // Markdown with top 20 bid/ask levels
 *
 * // Or analyze custom order book data
 * const analysis = await service.getData('ETHUSDT');
 * console.log(analysis.depthImbalance); // 0.125 (12.5% buy pressure)
 * console.log(analysis.bestBid); // 2300.50
 * ```
 */
export class BookDataMathService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Converts order book analysis into markdown report format.
   *
   * Takes pre-calculated order book analysis and formats it as markdown
   * with summary metrics and top 20 bid/ask levels sorted by volume.
   *
   * @param symbol - Trading pair symbol for header
   * @param bookData - Order book analysis from getData()
   * @returns Markdown-formatted order book report
   *
   * @example
   * ```typescript
   * const analysis = await service.getData('BTCUSDT');
   * const report = await service.generateReport('BTCUSDT', analysis);
   * console.log(report); // Markdown table with order book data
   * ```
   */
  public generateReport = async (
    symbol: string,
    bookData: IBookDataAnalysis
  ) => {
    this.loggerService.log("bookDataMathService generateReport", {
      symbol,
    });
    return await generateBookDataReport(this, bookData);
  };

  /**
   * Generates complete markdown order book report for a symbol.
   *
   * Fetches order book depth (up to 1000 levels) from exchange, calculates all metrics,
   * and formats results as markdown report optimized for LLM consumption.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @returns Markdown-formatted order book report with depth analysis
   *
   * @example
   * ```typescript
   * const report = await service.getReport('BTCUSDT');
   * console.log(report);
   * // # Order Book Analysis for BTCUSDT
   * // > Current time: 2025-01-14T10:30:00.000Z
   * //
   * // ## Order Book Summary
   * // - **Best Bid**: 42000.50 USD
   * // - **Depth Imbalance**: 12.5%
   * //
   * // ## Top 20 Order Book Levels
   * // ### Bids (Buy Orders)
   * // | Price | Quantity | % of Total |
   * ```
   */
  public getReport = async (symbol: string) => {
    this.loggerService.log("bookDataMathService getReport", {
      symbol,
    });
    const bookData = await this.getData(symbol);
    return await this.generateReport(symbol, bookData);
  };

  /**
   * Fetches and analyzes order book data with depth metrics.
   *
   * Retrieves up to 1000 depth levels from exchange, processes bid/ask data,
   * calculates volume percentages, and computes market depth metrics including
   * best bid/ask, mid price, spread, and depth imbalance.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @returns Order book analysis with all calculated metrics
   *
   * @example
   * ```typescript
   * const analysis = await service.getData('BTCUSDT');
   * console.log(analysis.bestBid); // 42000.50
   * console.log(analysis.bestAsk); // 42001.25
   * console.log(analysis.spread); // 0.75
   * console.log(analysis.depthImbalance); // 0.125 (12.5% buy pressure)
   * console.log(analysis.bids.length); // Up to 1000 levels
   * ```
   */
  public getData = async (symbol: string): Promise<IBookDataAnalysis> => {
    this.loggerService.log("bookDataMathService getBookDataAnalysis", {
      symbol,
    });

    const depth = await getOrderBook(symbol, MAX_DEPTH_LEVELS);

    // Just process raw data - no calculations
    const bids = processOrderBookSide(
      depth.bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
    ); // Сортировка по убыванию
    const asks = processOrderBookSide(
      depth.asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
    ); // Сортировка по возрастанию

    const bestBid = bids.length > 0 ? bids[0].price : 0;
    const bestAsk = asks.length > 0 ? asks[0].price : 0;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;

    // Calculate depth imbalance
    const totalBidVolume = bids.reduce((sum, bid) => sum + bid.quantity, 0);
    const totalAskVolume = asks.reduce((sum, ask) => sum + ask.quantity, 0);
    const depthImbalance =
      totalBidVolume + totalAskVolume > 0
        ? (totalBidVolume - totalAskVolume) / (totalBidVolume + totalAskVolume)
        : 0;

    return {
      symbol,
      timestamp: new Date().toISOString(),
      bids,
      asks,
      bestBid,
      bestAsk,
      midPrice,
      spread,
      depthImbalance,
    };
  };
}

export default BookDataMathService;
