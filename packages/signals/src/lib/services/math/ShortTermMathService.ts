import {
  FasterRSI as RSI,
  FasterMACD as MACD,
  FasterBollingerBands as BollingerBands,
  FasterSMA as SMA,
  FasterEMA as EMA,
  FasterATR as ATR,
  FasterStochasticOscillator as StochasticOscillator,
  FasterADX as ADX,
  FasterCCI as CCI,
  FasterStochasticRSI as StochasticRSI,
  FasterDEMA as DEMA,
  FasterWMA as WMA,
  FasterMOM as MOM,
  FasterROC as ROC,
} from "trading-signals";
import { Exchange, getCandles, ICandleData, formatPrice } from "backtest-kit";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

const TABLE_ROWS_LIMIT = 48;

const WARMUP_PERIOD = 50;

interface IShortTermRow {
  symbol: string;
  rsi9: number | null;
  stochasticRSI9: number | null;
  macd8_21_5: number | null;
  signal5: number | null;
  bollingerUpper10_2: number | null;
  bollingerMiddle10_2: number | null;
  bollingerLower10_2: number | null;
  bollingerWidth10_2: number | null;
  stochasticK5_3_3: number | null;
  stochasticD5_3_3: number | null;
  adx14: number | null;
  plusDI14: number | null;
  minusDI14: number | null;
  atr9: number | null;
  cci14: number | null;
  sma50: number | null;
  ema8: number | null;
  ema21: number | null;
  dema21: number | null;
  wma20: number | null;
  momentum8: number | null;
  roc5: number | null;
  roc10: number | null;
  volumeTrend: string;
  support: number;
  resistance: number;
  currentPrice: number;
  fibonacciNearestLevel: string;
  fibonacciNearestPrice: number;
  fibonacciDistance: number;
  bodySize: number;
  closePrice: number;
  date: Date;
  lookbackPeriod: string;
}

interface Column {
  key: keyof IShortTermRow;
  label: string;
  format: (
    value: number | string | Date,
    symbol: string
  ) => Promise<string> | string;
}

const columns: Column[] = [
  {
    key: "rsi9",
    label: "RSI(9)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochasticRSI9",
    label: "Stochastic RSI(9)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "macd8_21_5",
    label: "MACD(8,21,5)",
    format: (v) => (v !== null ? Number(v).toFixed(4) : "N/A"),
  },
  {
    key: "signal5",
    label: "Signal(5)",
    format: (v) => (v !== null ? Number(v).toFixed(4) : "N/A"),
  },
  {
    key: "adx14",
    label: "ADX(14)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "plusDI14",
    label: "+DI(14)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "minusDI14",
    label: "-DI(14)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "atr9",
    label: "ATR(9)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "cci14",
    label: "CCI(14)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochasticK5_3_3",
    label: "Stochastic K(5,3,3)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochasticD5_3_3",
    label: "Stochastic D(5,3,3)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "momentum8",
    label: "Momentum(8)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "roc5",
    label: "ROC(5)",
    format: (v) => (v !== null ? `${Number(v).toFixed(3)}%` : "N/A"),
  },
  {
    key: "roc10",
    label: "ROC(10)",
    format: (v) => (v !== null ? `${Number(v).toFixed(3)}%` : "N/A"),
  },
  {
    key: "sma50",
    label: "SMA(50)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "ema8",
    label: "EMA(8)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "ema21",
    label: "EMA(21)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "dema21",
    label: "DEMA(21)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "wma20",
    label: "WMA(20)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "currentPrice",
    label: "Current Price",
    format: async (v, symbol) =>
      `${await formatPrice(symbol, Number(v))} USD`,
  },
  {
    key: "support",
    label: "Support Level",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "resistance",
    label: "Resistance Level",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollingerUpper10_2",
    label: "Bollinger Upper(10,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollingerMiddle10_2",
    label: "Bollinger Middle(10,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollingerLower10_2",
    label: "Bollinger Lower(10,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollingerWidth10_2",
    label: "Bollinger Width(10,2.0)",
    format: (v) => (v !== null ? `${Number(v).toFixed(2)}%` : "N/A"),
  },
  {
    key: "fibonacciNearestLevel",
    label: "Fibonacci Nearest Level",
    format: (v) => String(v),
  },
  {
    key: "fibonacciNearestPrice",
    label: "Fibonacci Nearest Price",
    format: async (v, symbol) =>
      `${await formatPrice(symbol, Number(v))} USD`,
  },
  {
    key: "fibonacciDistance",
    label: "Fibonacci Distance",
    format: async (v, symbol) =>
      `${await formatPrice(symbol, Number(v))} USD`,
  },
  {
    key: "bodySize",
    label: "Body Size",
    format: async (v, symbol) =>
      `${await formatPrice(symbol, Number(v))} USD`,
  },
  {
    key: "closePrice",
    label: "Close Price",
    format: async (v, symbol) =>
      `${await formatPrice(symbol, Number(v))} USD`,
  },
  {
    key: "date",
    label: "Timestamp",
    format: (v) => new Date(v).toISOString(),
  },
];

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

function calculateFibonacciLevels(
  candles: ICandleData[],
  endIndex: number
): { level: string; price: number; distance: number } {
  const lookbackPeriod = Math.min(288, endIndex + 1);
  const startIndex = endIndex + 1 - lookbackPeriod;
  const recentCandles = candles.slice(startIndex, endIndex + 1);

  const high = Math.max(...recentCandles.map((c) => Number(c.high)));
  const low = Math.min(...recentCandles.map((c) => Number(c.low)));
  const range = high - low;

  const levels = {
    "0.0%": high,
    "23.6%": high - range * 0.236,
    "38.2%": high - range * 0.382,
    "50.0%": high - range * 0.5,
    "61.8%": high - range * 0.618,
    "78.6%": high - range * 0.786,
    "100.0%": low,
    "127.2%": high - range * 1.272,
    "161.8%": high - range * 1.618,
  };

  const currentPrice = Number(candles[endIndex].close);
  let nearestLevel = {
    level: "50.0%",
    price: levels["50.0%"],
    distance: Math.abs(currentPrice - levels["50.0%"]),
  };

  Object.entries(levels).forEach(([level, price]) => {
    const distance = Math.abs(currentPrice - price);
    if (distance < nearestLevel.distance) {
      nearestLevel = { level, price, distance };
    }
  });

  return nearestLevel;
}

function calculateVolumeTrend(
  candles: ICandleData[],
  endIndex: number
): string {
  const volumes = candles.slice(0, endIndex + 1).map((c) => Number(c.volume));

  if (volumes.length < 16) return "stable";

  const recentVolumes = volumes.slice(-8);
  const olderVolumes = volumes.slice(-16, -8);

  if (recentVolumes.length < 4 || olderVolumes.length < 4) return "stable";

  const recentAvg =
    recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
  const olderAvg =
    olderVolumes.reduce((sum, vol) => sum + vol, 0) / olderVolumes.length;

  if (recentAvg > olderAvg * 1.2) return "increasing";
  if (recentAvg < olderAvg * 0.8) return "decreasing";
  return "stable";
}

function generateAnalysis(
  symbol: string,
  candles: ICandleData[]
): IShortTermRow[] {
  const closes = candles.map((candle) => Number(candle.close));
  const highs = candles.map((candle) => Number(candle.high));
  const lows = candles.map((candle) => Number(candle.low));
  const opens = candles.map((candle) => Number(candle.open));

  const rsi = new RSI(9);
  const stochasticRSI = new StochasticRSI(9);
  const shortEMA = new EMA(8);
  const longEMA = new EMA(21);
  const signalEMA = new EMA(5);
  const macd = new MACD(shortEMA, longEMA, signalEMA);
  const bollinger = new BollingerBands(10, 2.0);
  const atr = new ATR(9);
  const sma50 = new SMA(50);
  const ema8 = new EMA(8);
  const ema21 = new EMA(21);
  const dema21 = new DEMA(21);
  const wma20 = new WMA(20);
  const momentum = new MOM(8);
  const roc5 = new ROC(5);
  const roc10 = new ROC(10);
  const stochastic = new StochasticOscillator(5, 3, 3);
  const cci = new CCI(14);
  const adx = new ADX(14);

  const results: IShortTermRow[] = [];

  candles.forEach((_candle, i) => {
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const open = opens[i];
    const currentPrice = close;

    // Update all indicators
    rsi.update(close, false);
    stochasticRSI.update(close, false);
    macd.update(close, false);
    bollinger.update(close, false);
    atr.update({ high, low, close }, false);
    sma50.update(close, false);
    ema8.update(close, false);
    ema21.update(close, false);
    dema21.update(close, false);
    wma20.update(close, false);
    momentum.update(close, false);
    roc5.update(close, false);
    roc10.update(close, false);
    stochastic.update({ high, low, close }, false);
    cci.update({ high, low, close }, false);
    adx.update({ high, low, close }, false);

    // Determine minimum warm-up period needed (largest indicator period)
    // SMA(50) is the largest period
    // Skip rows until all indicators are warmed up
    if (i < WARMUP_PERIOD) {
      return;
    }

    const volumeTrend = calculateVolumeTrend(candles, i);

    const pivotPeriod = Math.min(48, i + 1);
    const startIdx = i + 1 - pivotPeriod;
    const recentHighs = highs
      .slice(startIdx, i + 1)
      .filter((h) => !isUnsafe(h));
    const recentLows = lows.slice(startIdx, i + 1).filter((l) => !isUnsafe(l));

    const minDistance = currentPrice * 0.003;

    const significantHighs = [...recentHighs]
      .filter((h) => h > currentPrice + minDistance)
      .sort((a, b) => a - b);
    const significantLows = [...recentLows]
      .filter((l) => l < currentPrice - minDistance)
      .sort((a, b) => b - a);

    const resistance =
      significantHighs.length > 0
        ? significantHighs[0]
        : recentHighs.length > 0
        ? Math.max(...recentHighs)
        : currentPrice;
    const support =
      significantLows.length > 0
        ? significantLows[0]
        : recentLows.length > 0
        ? Math.min(...recentLows)
        : currentPrice;

    const fibonacciNearest = calculateFibonacciLevels(candles, i);

    const rsiValue = rsi.getResult() ?? null;
    const stochasticRSIResult = stochasticRSI.getResult();
    const stochasticRSIValue = !isUnsafe(stochasticRSIResult)
      ? stochasticRSIResult * 100
      : null;
    const macdResult = macd.getResult();
    const bollingerResult = bollinger.getResult();
    const stochasticResult = stochastic.getResult();
    const adxValue = adx.getResult() ?? null;
    const plusDI14 = typeof adx.pdi === "number" ? adx.pdi * 100 : null;
    const minusDI14 = typeof adx.mdi === "number" ? adx.mdi * 100 : null;

    const bodySize = Math.abs(close - open);

    results.push({
      symbol,
      rsi9: rsiValue != null && !isUnsafe(rsiValue) ? rsiValue : null,
      stochasticRSI9: stochasticRSIValue,
      macd8_21_5:
        macdResult && !isUnsafe(macdResult.macd) ? macdResult.macd : null,
      signal5:
        macdResult && !isUnsafe(macdResult.signal) ? macdResult.signal : null,
      bollingerUpper10_2:
        bollingerResult && !isUnsafe(bollingerResult.upper)
          ? bollingerResult.upper
          : null,
      bollingerMiddle10_2:
        bollingerResult && !isUnsafe(bollingerResult.middle)
          ? bollingerResult.middle
          : null,
      bollingerLower10_2:
        bollingerResult && !isUnsafe(bollingerResult.lower)
          ? bollingerResult.lower
          : null,
      bollingerWidth10_2:
        bollingerResult &&
        !isUnsafe(bollingerResult.upper) &&
        !isUnsafe(bollingerResult.lower) &&
        !isUnsafe(bollingerResult.middle)
          ? ((bollingerResult.upper - bollingerResult.lower) /
              bollingerResult.middle) *
            100
          : null,
      stochasticK5_3_3:
        stochasticResult && !isUnsafe(stochasticResult.stochK)
          ? stochasticResult.stochK
          : null,
      stochasticD5_3_3:
        stochasticResult && !isUnsafe(stochasticResult.stochD)
          ? stochasticResult.stochD
          : null,
      adx14: adxValue != null && !isUnsafe(adxValue) ? adxValue : null,
      plusDI14: plusDI14 != null && !isUnsafe(plusDI14) ? plusDI14 : null,
      minusDI14: minusDI14 != null && !isUnsafe(minusDI14) ? minusDI14 : null,
      atr9:
        atr.getResult() != null && !isUnsafe(atr.getResult())
          ? atr.getResult()
          : null,
      cci14:
        cci.getResult() != null && !isUnsafe(cci.getResult())
          ? cci.getResult()
          : null,
      sma50:
        sma50.getResult() != null && !isUnsafe(sma50.getResult())
          ? sma50.getResult()
          : null,
      ema8:
        ema8.getResult() != null && !isUnsafe(ema8.getResult())
          ? ema8.getResult()
          : null,
      ema21:
        ema21.getResult() != null && !isUnsafe(ema21.getResult())
          ? ema21.getResult()
          : null,
      dema21:
        dema21.getResult() != null && !isUnsafe(dema21.getResult())
          ? dema21.getResult()
          : null,
      wma20:
        wma20.getResult() != null && !isUnsafe(wma20.getResult())
          ? wma20.getResult()
          : null,
      momentum8:
        momentum.getResult() != null && !isUnsafe(momentum.getResult())
          ? momentum.getResult()
          : null,
      roc5:
        roc5.getResult() != null && !isUnsafe(roc5.getResult())
          ? roc5.getResult()
          : null,
      roc10:
        roc10.getResult() != null && !isUnsafe(roc10.getResult())
          ? roc10.getResult()
          : null,
      volumeTrend,
      support:
        support != null && !isUnsafe(support)
          ? support
          : !isUnsafe(currentPrice)
          ? currentPrice
          : null,
      resistance:
        resistance != null && !isUnsafe(resistance)
          ? resistance
          : !isUnsafe(currentPrice)
          ? currentPrice
          : null,
      currentPrice:
        currentPrice != null && !isUnsafe(currentPrice) ? currentPrice : null,
      fibonacciNearestLevel: fibonacciNearest.level,
      fibonacciNearestPrice: fibonacciNearest.price,
      fibonacciDistance: fibonacciNearest.distance,
      bodySize,
      closePrice: close,
      date: new Date(),
      lookbackPeriod: "144 candles (36 hours)",
    });
  });

  // Return only the last TABLE_ROWS_LIMIT rows
  return results.slice(-TABLE_ROWS_LIMIT);
}

async function generateHistoryTable(
  indicators: IShortTermRow[],
  symbol: string
): Promise<string> {
  let markdown = "";
  markdown += `# 15-Minute Candles Trading Analysis for ${symbol} (Historical Data)\n\n`;

  const header = `| ${columns.map((col) => col.label).join(" | ")} |\n`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |\n`;

  const tableRows = await Promise.all(
    indicators.map(async (ind) => {
      const cells = await Promise.all(
        columns.map(async (col) => await col.format(ind[col.key], symbol))
      );
      return `| ${cells.join(" | ")} |`;
    })
  );

  markdown += header;
  markdown += separator;
  markdown += tableRows.join("\n");
  markdown += "\n\n";

  markdown += "## Data Sources\n";
  markdown += "- **Timeframe**: 15-minute candles\n";
  markdown += "- **Lookback Period**: 144 candles (36 hours)\n";
  markdown +=
    "- **RSI(9)**: over previous 9 candles (135 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic RSI(9)**: over previous 9 candles (135 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **MACD(8,21,5)**: fast 8 and slow 21 periods on 15m timeframe before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **Signal(5)**: over previous 5 candles (75 minutes on 15m timeframe) before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **ADX(14)**: over previous 14 candles (210 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **+DI(14)**: over previous 14 candles (210 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **-DI(14)**: over previous 14 candles (210 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **ATR(9)**: over previous 9 candles (135 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **CCI(14)**: over previous 14 candles (210 minutes on 15m timeframe) before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **Bollinger Upper(10,2.0)**: over previous 10 candles (150 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Middle(10,2.0)**: over previous 10 candles (150 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Lower(10,2.0)**: over previous 10 candles (150 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Width(10,2.0)**: width percentage before row timestamp (Min: 0%, Max: +∞)\n";
  markdown +=
    "- **Stochastic K(5,3,3)**: over previous 5 candles (75 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic D(5,3,3)**: over previous 5 candles (75 minutes on 15m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Momentum(8)**: over previous 8 candles (120 minutes on 15m timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)\n";
  markdown +=
    "- **ROC(5)**: over previous 5 candles (75 minutes on 15m timeframe) before row timestamp (Min: -∞%, Max: +∞%)\n";
  markdown +=
    "- **ROC(10)**: over previous 10 candles (150 minutes on 15m timeframe) before row timestamp (Min: -∞%, Max: +∞%)\n";
  markdown +=
    "- **SMA(50)**: over previous 50 candles (750 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **EMA(8)**: over previous 8 candles (120 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **EMA(21)**: over previous 21 candles (315 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **DEMA(21)**: over previous 21 candles (315 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **WMA(20)**: over previous 20 candles (300 minutes on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Support**: over previous 48 candles (12 hours on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Resistance**: over previous 48 candles (12 hours on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Fibonacci Nearest Level**: nearest level name before row timestamp\n";
  markdown +=
    "- **Fibonacci Nearest Price**: nearest price level over 288 candles (72h on 15m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Fibonacci Distance**: distance to nearest level before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Current Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Body Size**: candle body size at row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Close Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)\n";

  return markdown;
}

export class ShortTermHistoryService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);

  public getData = async (
    symbol: string,
    candles: ICandleData[]
  ): Promise<IShortTermRow[]> => {
    this.loggerService.log("shortTermHistoryService getData", {
      symbol,
      candles: candles.length,
    });
    return generateAnalysis(symbol, candles);
  };

  public getReport = async (symbol: string): Promise<string> => {
    this.loggerService.log("shortTermHistoryService getReport", { symbol });
    const candles: ICandleData[] = await getCandles(symbol, "15m", 144);
    const rows = await this.getData(symbol, candles);
    return generateHistoryTable(rows, symbol);
  };

  public generateHistoryTable = async (
    symbol: string,
    rows: IShortTermRow[]
  ): Promise<string> => {
    this.loggerService.log("shortTermHistoryService generateHistoryTable", {
      symbol,
      rowCount: rows.length,
    });
    return generateHistoryTable(rows, symbol);
  };
}

export default ShortTermHistoryService;
