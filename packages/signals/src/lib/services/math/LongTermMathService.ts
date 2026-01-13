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
  FasterDEMA as DEMA,
  FasterWMA as WMA,
  FasterMOM as MOM,
  FasterStochasticRSI as StochasticRSI,
} from "trading-signals";
import { log } from "pinolog";
import { Exchange, getCandles, ICandleData, formatPrice } from "backtest-kit";

const TABLE_ROWS_LIMIT = 48;

const WARMUP_PERIOD = 50;

interface ILongTermRow {
  symbol: string;
  rsi14: number | null;
  stochasticRSI14: number | null;
  macd12_26_9: number | null;
  signal9: number | null;
  adx14: number | null;
  pdi14: number | null;
  ndi14: number | null;
  atr14: number | null;
  atr14_raw: number | null;
  atr20: number | null;
  cci20: number | null;
  bollinger20_2_upper: number | null;
  bollinger20_2_middle: number | null;
  bollinger20_2_lower: number | null;
  stochastic14_3_3_K: number | null;
  stochastic14_3_3_D: number | null;
  momentum10: number | null;
  dema21: number | null;
  wma20: number | null;
  sma50: number | null;
  ema20: number | null;
  ema34: number | null;
  currentPrice: number;
  support: number;
  resistance: number;
  volumeTrend: string;
  fibonacciNearestLevel: string;
  fibonacciNearestPrice: number;
  fibonacciDistance: number;
  bodySize: number;
  closePrice: number;
  date: Date;
  lookbackPeriod: string;
}

interface Column {
  key: keyof ILongTermRow;
  label: string;
  format: (
    value: number | string | Date,
    symbol: string
  ) => Promise<string> | string;
}

const columns: Column[] = [
  {
    key: "rsi14",
    label: "RSI(14)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochasticRSI14",
    label: "Stochastic RSI(14)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "macd12_26_9",
    label: "MACD(12,26,9)",
    format: (v) => (v !== null ? Number(v).toFixed(4) : "N/A"),
  },
  {
    key: "signal9",
    label: "Signal(9)",
    format: (v) => (v !== null ? Number(v).toFixed(4) : "N/A"),
  },
  {
    key: "adx14",
    label: "ADX(14)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "pdi14",
    label: "+DI(14)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "ndi14",
    label: "-DI(14)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "atr14",
    label: "ATR(14)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "atr14_raw",
    label: "ATR(14) Raw",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "atr20",
    label: "ATR(20)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "cci20",
    label: "CCI(20)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochastic14_3_3_K",
    label: "Stochastic K(14,3,3)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochastic14_3_3_D",
    label: "Stochastic D(14,3,3)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "momentum10",
    label: "Momentum(10)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
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
    key: "sma50",
    label: "SMA(50)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "ema20",
    label: "EMA(20)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "ema34",
    label: "EMA(34)",
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
    key: "bollinger20_2_upper",
    label: "Bollinger Upper(20,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollinger20_2_middle",
    label: "Bollinger Middle(20,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollinger20_2_lower",
    label: "Bollinger Lower(20,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
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
  const lookbackPeriod = Math.min(24, endIndex + 1);
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

function generateAnalysis(
  symbol: string,
  candles: ICandleData[]
): ILongTermRow[] {
  const closes = candles.map((candle) => Number(candle.close));
  const highs = candles.map((candle) => Number(candle.high));
  const lows = candles.map((candle) => Number(candle.low));
  const volumes = candles.map((candle) => Number(candle.volume));
  const opens = candles.map((candle) => Number(candle.open));

  const rsi = new RSI(14);
  const stochasticRSI = new StochasticRSI(14);
  const macdShortEMA = new EMA(12);
  const macdLongEMA = new EMA(26);
  const macdSignalEMA = new EMA(9);
  const macd = new MACD(macdShortEMA, macdLongEMA, macdSignalEMA);
  const bollinger = new BollingerBands(20, 2.0);
  const atr14 = new ATR(14);
  const atr20 = new ATR(20);
  const ema20 = new EMA(20);
  const ema34 = new EMA(34);
  const dema = new DEMA(21);
  const wma = new WMA(20);
  const momentum = new MOM(10);
  const stochastic = new StochasticOscillator(14, 3, 3);
  const adx = new ADX(14);
  const cci = new CCI(20);
  const sma50 = new SMA(50);

  const results: ILongTermRow[] = [];

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
    atr14.update({ high, low, close }, false);
    atr20.update({ high, low, close }, false);
    ema20.update(close, false);
    ema34.update(close, false);
    dema.update(close, false);
    wma.update(close, false);
    momentum.update(close, false);
    stochastic.update({ high, low, close }, false);
    adx.update({ high, low, close }, false);
    cci.update({ high, low, close }, false);
    sma50.update(close, false);

    // Determine minimum warm-up period needed (largest indicator period)
    // SMA(50) is the largest period
    // Skip rows until all indicators are warmed up
    if (i < WARMUP_PERIOD) {
      return;
    }

    // Volume trend calculation
    const volumeSma6 = new SMA(6);
    const volumeSma6Prev = new SMA(6);

    const volumeStart = Math.max(0, i + 1 - 12);
    const prevVolumeData = volumes.slice(
      volumeStart,
      Math.min(volumeStart + 6, i + 1)
    );
    const recentVolumeData = volumes.slice(Math.max(0, i + 1 - 6), i + 1);

    if (prevVolumeData.length > 0) {
      prevVolumeData.forEach((vol) => volumeSma6Prev.update(vol, false));
    }
    if (recentVolumeData.length > 0) {
      recentVolumeData.forEach((vol) => volumeSma6.update(vol, false));
    }

    const recentVolumeRaw = volumeSma6.getResult();
    const prevVolumeRaw = volumeSma6Prev.getResult();
    const recentVolume = !isUnsafe(recentVolumeRaw)
      ? recentVolumeRaw
      : volumes[i];
    const prevVolume = !isUnsafe(prevVolumeRaw)
      ? prevVolumeRaw
      : volumes[Math.max(0, i - 6)];
    const volumeTrend =
      !isUnsafe(recentVolume) && !isUnsafe(prevVolume)
        ? recentVolume > prevVolume * 1.1
          ? "increasing"
          : recentVolume < prevVolume * 0.9
          ? "decreasing"
          : "stable"
        : "stable";

    // Support/Resistance calculation
    const pivotPeriod = Math.min(4, i + 1);
    const startIdx = i + 1 - pivotPeriod;
    const recentHighs = highs
      .slice(startIdx, i + 1)
      .filter((h) => !isUnsafe(h));
    const recentLows = lows.slice(startIdx, i + 1).filter((l) => !isUnsafe(l));
    const support =
      recentLows.length > 0 ? Math.min(...recentLows) : currentPrice;
    const resistance =
      recentHighs.length > 0 ? Math.max(...recentHighs) : currentPrice;

    // Fibonacci calculation
    const fibonacciNearest = calculateFibonacciLevels(candles, i);

    // Get results
    const rsiValue = rsi.getResult() ?? null;
    const stochasticRSIResult = stochasticRSI.getResult();
    const stochasticRSIValue = !isUnsafe(stochasticRSIResult)
      ? stochasticRSIResult * 100
      : null;
    const macdResult = macd.getResult();
    const bollingerResult = bollinger.getResult();
    const stochasticResult = stochastic.getResult();
    const adxValue = adx.getResult() ?? null;
    const pdiValue = typeof adx.pdi === "number" ? adx.pdi * 100 : null;
    const ndiValue = typeof adx.mdi === "number" ? adx.mdi * 100 : null;

    const bodySize = Math.abs(close - open);

    results.push({
      symbol,
      rsi14: rsiValue != null && !isUnsafe(rsiValue) ? rsiValue : null,
      stochasticRSI14: stochasticRSIValue,
      macd12_26_9:
        macdResult && !isUnsafe(macdResult.macd) ? macdResult.macd : null,
      signal9:
        macdResult && !isUnsafe(macdResult.signal) ? macdResult.signal : null,
      bollinger20_2_upper:
        bollingerResult && !isUnsafe(bollingerResult.upper)
          ? bollingerResult.upper
          : null,
      bollinger20_2_middle:
        bollingerResult && !isUnsafe(bollingerResult.middle)
          ? bollingerResult.middle
          : null,
      bollinger20_2_lower:
        bollingerResult && !isUnsafe(bollingerResult.lower)
          ? bollingerResult.lower
          : null,
      atr14:
        atr14.getResult() != null && !isUnsafe(atr14.getResult())
          ? atr14.getResult()
          : null,
      atr14_raw:
        atr14.getResult() != null && !isUnsafe(atr14.getResult())
          ? atr14.getResult()
          : null,
      atr20:
        atr20.getResult() != null && !isUnsafe(atr20.getResult())
          ? atr20.getResult()
          : null,
      sma50:
        sma50.getResult() != null && !isUnsafe(sma50.getResult())
          ? sma50.getResult()
          : null,
      ema20:
        ema20.getResult() != null && !isUnsafe(ema20.getResult())
          ? ema20.getResult()
          : null,
      ema34:
        ema34.getResult() != null && !isUnsafe(ema34.getResult())
          ? ema34.getResult()
          : null,
      dema21:
        dema.getResult() != null && !isUnsafe(dema.getResult())
          ? dema.getResult()
          : null,
      wma20:
        wma.getResult() != null && !isUnsafe(wma.getResult())
          ? wma.getResult()
          : null,
      momentum10:
        momentum.getResult() != null && !isUnsafe(momentum.getResult())
          ? momentum.getResult()
          : null,
      stochastic14_3_3_K:
        stochasticResult && !isUnsafe(stochasticResult.stochK)
          ? stochasticResult.stochK
          : null,
      stochastic14_3_3_D:
        stochasticResult && !isUnsafe(stochasticResult.stochD)
          ? stochasticResult.stochD
          : null,
      adx14: adxValue != null && !isUnsafe(adxValue) ? adxValue : null,
      pdi14: pdiValue != null && !isUnsafe(pdiValue) ? pdiValue : null,
      ndi14: ndiValue != null && !isUnsafe(ndiValue) ? ndiValue : null,
      cci20:
        cci.getResult() != null && !isUnsafe(cci.getResult())
          ? cci.getResult()
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
      lookbackPeriod: "48 candles (48 hours) with SMA(50) from 100 hours",
    });
  });

  return results;
}

async function generateHistoryTable(
  indicators: ILongTermRow[],
  symbol: string
): Promise<string> {
  let markdown = "";
  markdown += `# 1-Hour Candles Trading Analysis for ${symbol} (Historical Data)\n\n`;

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
  markdown += "- **Timeframe**: 1-hour candles\n";
  markdown += "- **Lookback Period**: 48 candles (48 hours)\n";
  markdown +=
    "- **RSI(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic RSI(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **MACD(12,26,9)**: fast 12 and slow 26 periods on 1h timeframe before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **Signal(9)**: over previous 9 candles (9 hours on 1h timeframe) before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **ADX(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **+DI(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **-DI(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **ATR(14)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **ATR(14) Raw**: raw value over previous 14 candles before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **ATR(20) Raw**: raw value over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **CCI(20)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **Bollinger Upper(20,2.0)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Middle(20,2.0)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Lower(20,2.0)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Stochastic K(14,3,3)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic D(14,3,3)**: over previous 14 candles (14 hours on 1h timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **DEMA(21)**: over previous 21 candles (21 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **WMA(20)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **SMA(50)**: over previous 50 candles (50 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **EMA(20)**: over previous 20 candles (20 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **EMA(34)**: over previous 34 candles (34 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Momentum(10)**: over previous 10 candles (10 hours on 1h timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)\n";
  markdown +=
    "- **Support**: over previous 4 candles (4 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Resistance**: over previous 4 candles (4 hours on 1h timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Fibonacci Nearest Level**: nearest level name before row timestamp\n";
  markdown +=
    "- **Fibonacci Nearest Price**: nearest price level before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
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

export class LongTermHistoryService {
  public getData = async (
    symbol: string,
    candles: ICandleData[]
  ): Promise<ILongTermRow[]> => {
    log("longTermHistoryService getData", {
      symbol,
      candles: candles.length,
    });
    return generateAnalysis(symbol, candles);
  };

  public getReport = async (symbol: string): Promise<string> => {
    log("longTermHistoryService getReport", { symbol });
    const fullCandles: ICandleData[] = await getCandles(symbol, "1h", 100);
    // Use all candles for indicator warm-up, then filter to last TABLE_ROWS_LIMIT rows
    const allRows = await this.getData(symbol, fullCandles);
    const rows = allRows.slice(-TABLE_ROWS_LIMIT);
    return generateHistoryTable(rows, symbol);
  };

  public generateHistoryTable = async (
    symbol: string,
    rows: ILongTermRow[]
  ): Promise<string> => {
    log("longTermHistoryService generateHistoryTable", {
      symbol,
      rowCount: rows.length,
    });
    return generateHistoryTable(rows, symbol);
  };
}

export default LongTermHistoryService;
