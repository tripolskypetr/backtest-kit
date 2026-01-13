import { ttl } from "functools-kit";
import { getExchange } from "../../../config/ccxt";
import { Exchange, formatPrice, formatQuantity } from "backtest-kit";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

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

// Local type definitions for Binance API
interface Bid {
  price: string;
  quantity: string;
}

interface OrderBook {
  symbol: string;
  bids: Bid[];
  asks: Bid[];
}

const TTL_TIMEOUT = 5 * 60 * 1_000; // 5 minutes for order book data
const MAX_DEPTH_LEVELS = 1000; // Maximum depth for more accurate metrics

// Simple order book entry with percentage
interface IOrderBookEntry {
  price: number;
  quantity: number;
  percentage: number; // % of total volume on this side
}

export interface IBookDataAnalysis {
  symbol: string;
  timestamp: string;
  bids: IOrderBookEntry[];
  asks: IOrderBookEntry[];
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spread: number;
  depthImbalance: number; // (total_bid_volume - total_ask_volume) / (total_bid_volume + total_ask_volume)
}

function processOrderBookSide(orders: Bid[]): IOrderBookEntry[] {
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

// Generate simple order book report
const generateBookDataReport = async (
  self: BookDataMathService,
  result: IBookDataAnalysis
): Promise<string> => {
  let markdown = `# Order Book Analysis for ${result.symbol}\n\n`;
  markdown += `*Report generated: ${result.timestamp}*\n\n`;

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

export class BookDataMathService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);

  public generateReport = async (
    symbol: string,
    bookData: IBookDataAnalysis
  ) => {
    this.loggerService.log("bookDataMathService generateReport", {
      symbol,
    });
    return await generateBookDataReport(this, bookData);
  };

  public getReport = async (symbol: string) => {
    this.loggerService.log("bookDataMathService getReport", {
      symbol,
    });
    const bookData = await this.getData(symbol);
    return await this.generateReport(symbol, bookData);
  };

  public getData = async (symbol: string): Promise<IBookDataAnalysis> => {
    this.loggerService.log("bookDataMathService getBookDataAnalysis", {
      symbol,
    });

    const exchange = await getExchange();
    const depthRaw = await exchange.fetchOrderBook(symbol, MAX_DEPTH_LEVELS);
    const depth: OrderBook = {
      symbol: depthRaw.symbol,
      asks: depthRaw.asks.map(([price, quantity]) => ({
        price: String(price),
        quantity: String(quantity),
      })),
      bids: depthRaw.bids.map(([price, quantity]) => ({
        price: String(price),
        quantity: String(quantity),
      })),
    };

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
