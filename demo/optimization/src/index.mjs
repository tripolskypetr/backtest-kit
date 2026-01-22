import { addOptimizerSchema, Optimizer, listenOptimizerProgress } from "@backtest-kit/ollama";
import { fetchApi, str } from "functools-kit";
import { Ollama } from "ollama";
import fs from "fs/promises";

function arrayToMarkdownTable(data) {
  if (!data.length) return "";

  const cols = Object.keys(data[0]);

  const header = `| ${cols.join(" | ")} |`;
  const separator = `| ${cols.map(() => "---").join(" | ")} |`;

  const rows = data.map((row) => `| ${cols.map((c) => row[c]).join(" | ")} |`);

  return [header, separator, ...rows].join("\n");
}

const TRAIN_RANGE = [
  {
    note: "24 ноября 2025",
    startDate: new Date("2025-11-24T00:00:00Z"),
    endDate: new Date("2025-11-24T23:59:59Z"),
  },
  {
    note: "25 ноября 2025",
    startDate: new Date("2025-11-25T00:00:00Z"),
    endDate: new Date("2025-11-25T23:59:59Z"),
  },
  {
    note: "26 ноября 2025",
    startDate: new Date("2025-11-26T00:00:00Z"),
    endDate: new Date("2025-11-26T23:59:59Z"),
  },
  {
    note: "27 ноября 2025",
    startDate: new Date("2025-11-27T00:00:00Z"),
    endDate: new Date("2025-11-27T23:59:59Z"),
  },
  {
    note: "28 ноября 2025",
    startDate: new Date("2025-11-28T00:00:00Z"),
    endDate: new Date("2025-11-28T23:59:59Z"),
  },
  {
    note: "29 ноября 2025",
    startDate: new Date("2025-11-29T00:00:00Z"),
    endDate: new Date("2025-11-29T23:59:59Z"),
  },
  {
    note: "30 ноября 2025",
    startDate: new Date("2025-11-30T00:00:00Z"),
    endDate: new Date("2025-11-30T23:59:59Z"),
  },
];

const TEST_RANGE = {
  note: "1 декабря 2025",
  startDate: new Date("2025-12-01T00:00:00Z"),
  endDate: new Date("2025-12-01T23:59:59Z"),
};

/**
 * @see https://github.com/tripolskypetr/node-ccxt-dumper
 */
const SOURCE_LIST = [
  {
    name: "long-term-range",
    fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
      const url = new URL(
        `${process.env.CCXT_DUMPER_URL}/view/long-term-range`
      );
      {
        url.searchParams.set("symbol", symbol);
        url.searchParams.set("startDate", startDate.getTime());
        url.searchParams.set("endDate", endDate.getTime());
        url.searchParams.set("limit", limit || 1000);
        url.searchParams.set("offset", offset || 0);
      }
      const { rows: data } = await fetchApi(url);
      return data;
    },
    user: (symbol, data) =>
      str.newline(
        `# 1-Hour Candles Trading Analysis for ${symbol} (Historical Data)\n\n`,
        "",
        arrayToMarkdownTable(data),
        "",
        "## Data Sources",
        "- **Timeframe**: 1-hour candles",
        "- **Lookback Period**: 48 candles (48 hours)",
        "- **RSI(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Stochastic RSI(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **MACD(12,26,9)**: fast 12 and slow 26 periods on 1h timeframe before row timestamp (Min: -∞, Max: +∞)",
        "- **Signal(9)**: over previous 9 candles (9 hours on 1h timeframe) before row timestamp (Min: -∞, Max: +∞)",
        "- **ADX(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **+DI(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **-DI(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **ATR(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **ATR(14) Raw**: raw value over previous 14 candles before row timestamp (Min: 0 USD, Max: +∞)",
        "- **ATR(20) Raw**: raw value over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **CCI(20)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: -∞, Max: +∞)",
        "- **Bollinger Upper(20,2.0)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Middle(20,2.0)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Lower(20,2.0)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Stochastic K(14,3,3)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Stochastic D(14,3,3)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **DEMA(21)**: over previous 21 candles (21 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **WMA(20)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **SMA(50)**: over previous 50 candles (50 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **EMA(20)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **EMA(34)**: over previous 34 candles (34 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Momentum(10)**: over previous 10 candles (10 hours on 1h timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)",
        "- **Support**: over previous 4 candles (4 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Resistance**: over previous 4 candles (4 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Fibonacci Nearest Level**: nearest level name before row timestamp",
        "- **Fibonacci Nearest Price**: nearest price level before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Fibonacci Distance**: distance to nearest level before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Current Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Body Size**: candle body size at row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Close Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)"
      ),
    assistant: () => "Исторические данные 1-часовых свечей получены",
  },
  {
    name: "swing-term-range",
    fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
      const url = new URL(
        `${process.env.CCXT_DUMPER_URL}/view/swing-term-range`
      );
      {
        url.searchParams.set("symbol", symbol);
        url.searchParams.set("startDate", startDate.getTime());
        url.searchParams.set("endDate", endDate.getTime());
        url.searchParams.set("limit", limit || 1000);
        url.searchParams.set("offset", offset || 0);
      }
      const { rows: data } = await fetchApi(url);
      return data;
    },
    user: (symbol, data) =>
      str.newline(
        `# 30-Min Candles Analysis for ${symbol} (Historical Data)\n\n`,
        "",
        arrayToMarkdownTable(data),
        "",
        "## Data Sources",
        "- **Timeframe**: 30-minute candles",
        "- **Lookback Period**: 96 candles (48 hours)",
        "- **RSI(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Stochastic RSI(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **MACD(12,26,9)**: fast 12 and slow 26 periods on 30m timeframe before row timestamp (Min: -∞, Max: +∞)",
        "- **Signal(9)**: over previous 9 candles (4.5 hours on 30m timeframe) before row timestamp (Min: -∞, Max: +∞)",
        "- **ADX(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **+DI(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **-DI(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **ATR(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **CCI(20)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: -∞, Max: +∞)",
        "- **Bollinger Upper(20,2.0)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Middle(20,2.0)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Lower(20,2.0)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Width(20,2.0)**: width percentage before row timestamp (Min: 0%, Max: +∞)",
        "- **Stochastic K(14,3,3)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Stochastic D(14,3,3)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **DEMA(21)**: over previous 21 candles (10.5 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **WMA(20)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **SMA(20)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **EMA(13)**: over previous 13 candles (6.5 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **EMA(34)**: over previous 34 candles (17 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Momentum(8)**: over previous 8 candles (4 hours on 30m timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)",
        "- **Support**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Resistance**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Price Momentum(6)**: over previous 6 candles (3 hours on 30m timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)",
        "- **Current Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Body Size**: candle body size at row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Close Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Volume**: trading volume at row timestamp (Min: 0, Max: +∞)",
        "- **Volatility**: volatility percentage at row timestamp (Min: 0%, Max: +∞)"
      ),
    assistant: () => "Исторические данные 30-минутных свечей получены",
  },
  {
    name: "short-term-range",
    fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
      const url = new URL(
        `${process.env.CCXT_DUMPER_URL}/view/short-term-range`
      );
      {
        url.searchParams.set("symbol", symbol);
        url.searchParams.set("startDate", startDate.getTime());
        url.searchParams.set("endDate", endDate.getTime());
        url.searchParams.set("limit", limit || 1000);
        url.searchParams.set("offset", offset || 0);
      }
      const { rows: data } = await fetchApi(url);
      return data;
    },
    user: (symbol, data) =>
      str.newline(
        `# 15-Minute Candles Trading Analysis for ${symbol} (Historical Data)\n\n`,
        "",
        arrayToMarkdownTable(data),
        "",
        "## Data Sources",
        "- **Timeframe**: 15-minute candles",
        "- **RSI(9)**: over previous 9 candles (135 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Stochastic RSI(9)**: over previous 9 candles (135 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **MACD(8,21,5)**: fast 8 and slow 21 periods on 15m timeframe before row timestamp (Min: -∞, Max: +∞)",
        "- **Signal(5)**: over previous 5 candles (75 minutes on 15m timeframe) before row timestamp (Min: -∞, Max: +∞)",
        "- **ADX(14)**: over previous 14 candles (210 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **+DI(14)**: over previous 14 candles (210 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **-DI(14)**: over previous 14 candles (210 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **ATR(9)**: over previous 9 candles (135 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **CCI(14)**: over previous 14 candles (210 minutes on 15m timeframe) before row timestamp (Min: -∞, Max: +∞)",
        "- **Bollinger Upper(10,2.0)**: over previous 10 candles (150 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Middle(10,2.0)**: over previous 10 candles (150 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Lower(10,2.0)**: over previous 10 candles (150 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Width(10,2.0)**: width percentage before row timestamp (Min: 0%, Max: +∞)",
        "- **Stochastic K(5,3,3)**: over previous 5 candles (75 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Stochastic D(5,3,3)**: over previous 5 candles (75 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Momentum(8)**: over previous 8 candles (120 minutes on 15m timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)",
        "- **ROC(5)**: over previous 5 candles (75 minutes on 15m timeframe) before row timestamp (Min: -∞%, Max: +∞%)",
        "- **ROC(10)**: over previous 10 candles (150 minutes on 15m timeframe) before row timestamp (Min: -∞%, Max: +∞%)",
        "- **SMA(50)**: over previous 50 candles (750 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **EMA(8)**: over previous 8 candles (120 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **EMA(21)**: over previous 21 candles (315 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **DEMA(21)**: over previous 21 candles (315 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **WMA(20)**: over previous 20 candles (300 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Support**: over previous 48 candles (12 hours on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Resistance**: over previous 48 candles (12 hours on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Current Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Body Size**: candle body size at row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Close Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)"
      ),
    assistant: () => "Исторические данные 15-минутных свечей получены",
  },
  {
    name: "micro-term-range",
    fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
      const url = new URL(
        `${process.env.CCXT_DUMPER_URL}/view/micro-term-range`
      );
      {
        url.searchParams.set("symbol", symbol);
        url.searchParams.set("startDate", startDate.getTime());
        url.searchParams.set("endDate", endDate.getTime());
        url.searchParams.set("limit", limit || 1000);
        url.searchParams.set("offset", offset || 0);
      }
      const { rows: data } = await fetchApi(url);
      return data;
    },
    user: (symbol, data) =>
      str.newline(
        `# 1-Minute Candles Analysis for ${symbol} (Historical Data)\n\n`,
        "",
        arrayToMarkdownTable(data),
        "",
        "## Data Sources",
        "- **Timeframe**: 1-minute candles",
        "- **Lookback Period**: 60 candles (1 hour)",
        "- **History Interval**: Every 2 minutes",
        "- **RSI(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Stochastic RSI(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **MACD(8,21,5)**: fast 8 and slow 21 periods on 1m timeframe before row timestamp (Min: -∞, Max: +∞)",
        "- **Signal(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: -∞, Max: +∞)",
        "- **MACD Histogram**: histogram value before row timestamp (Min: -∞, Max: +∞)",
        "- **Bollinger Upper(8,2.0)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Middle(8,2.0)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Lower(8,2.0)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Bollinger Width**: width percentage before row timestamp (Min: 0%, Max: +∞)",
        "- **Bollinger Position**: price position within bands before row timestamp (Min: 0%, Max: 100%)",
        "- **Stochastic K(3,3,3)**: over previous 3 candles (3 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Stochastic D(3,3,3)**: over previous 3 candles (3 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Stochastic K(5,3,3)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **Stochastic D(5,3,3)**: over previous 5 candles before row timestamp (Min: 0, Max: 100)",
        "- **ADX(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **+DI(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **-DI(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)",
        "- **CCI(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: -∞, Max: +∞)",
        "- **ATR(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **ATR(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞)",
        "- **Volatility(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0%, Max: +∞)",
        "- **True Range**: true range value at row timestamp (Min: 0 USD, Max: +∞)",
        "- **Momentum(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)",
        "- **Momentum(10)**: over previous 10 candles (10 minutes on 1m timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)",
        "- **ROC(1)**: over previous 1 candle (1 minute on 1m timeframe) before row timestamp (Min: -∞%, Max: +∞%)",
        "- **ROC(3)**: over previous 3 candles (3 minutes on 1m timeframe) before row timestamp (Min: -∞%, Max: +∞%)",
        "- **ROC(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: -∞%, Max: +∞%)",
        "- **EMA(3)**: over previous 3 candles (3 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **EMA(8)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **EMA(13)**: over previous 13 candles (13 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **EMA(21)**: over previous 21 candles (21 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **SMA(8)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **DEMA(8)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **WMA(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Volume SMA(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0, Max: +∞)",
        "- **Volume Ratio**: volume relative to average at row timestamp (Min: 0x, Max: +∞x)",
        "- **Support**: over previous 30 candles (30 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Resistance**: over previous 30 candles (30 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **Current Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)",
        "- **1m Change**: price change percentage over 1 minute at row timestamp (Min: -∞%, Max: +∞%)",
        "- **3m Change**: price change percentage over 3 minutes at row timestamp (Min: -∞%, Max: +∞%)",
        "- **5m Change**: price change percentage over 5 minutes at row timestamp (Min: -∞%, Max: +∞%)",
        "- **Squeeze Momentum**: squeeze momentum indicator at row timestamp (Min: 0, Max: +∞)",
        "- **Pressure Index**: buying/selling pressure percentage at row timestamp (Min: -100%, Max: +100%)"
      ),
    assistant: () => "Исторические данные 1-минутных свечей получены",
  },
];

async function text(symbol, messages) {
  const ollama = new Ollama({
    host: "https://ollama.com",
    headers: {
      Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
    },
  });

  const response = await ollama.chat({
    model: "deepseek-v3.1:671b",
    think: true,
    messages: [
      {
        role: "system",
        content: [
          "В ответ напиши торговую стратегию где нет ничего лишнего,",
          "только отчёт готовый для копипасты целиком",
          "",
          "**ВАЖНО**: Не здоровайся, не говори что делаешь - только отчёт!",
        ].join("\n"),
      },
      {
        role: "system",
        content: "Reasoning: high",
      },
      ...messages,
      {
        role: "user",
        content: [
          `На каких условиях мне купить ${symbol}?`,
          "Дай анализ рынка на основе поддержки/сопротивления, точек входа в LONG/SHORT позиции.",
          "Какой RR ставить для позиций?",
          "Предпочтительны LONG или SHORT позиции?",
          "",
          "Сделай не сухой технический, а фундаментальный анализ, содержащий стратигическую рекомендацию, например, покупать на низу боковика",
        ].join("\n"),
      },
    ],
  });

  const content = response.message.content.trim();
  return content
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

addOptimizerSchema({
  optimizerName: "btc-optimizer",

  rangeTrain: TRAIN_RANGE,
  rangeTest: TEST_RANGE,
  source: SOURCE_LIST,

  getPrompt: async (symbol, messages) => {
    return await text(symbol, messages);
  },
});

listenOptimizerProgress(({ progress }) => {
  console.log(`Progress: ${progress * 100}%`);
});

await Optimizer.dump(
  "BTCUSDT",
  {
    optimizerName: "btc-optimizer",
  },
  "./generated"
);

/*
await Optimizer.getData("BTCUSDT", {
  optimizerName: "btc-optimizer",
}).then((list) =>
  fs.writeFile(
    "./strategy_list.json",
    JSON.stringify(
      list.map(({ strategy }) => strategy),
      null,
      2
    )
  )
);
*/
