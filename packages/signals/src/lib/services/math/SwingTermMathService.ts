import {
  FasterMACD as MACD,
  FasterRSI as RSI,
  FasterBollingerBands as BollingerBands,
  FasterSMA as SMA,
  FasterEMA as EMA,
  FasterStochasticOscillator as StochasticOscillator,
  FasterADX as ADX,
  FasterDX as DX,
  FasterCCI as CCI,
  FasterATR as ATR,
  FasterStochasticRSI as StochasticRSI,
  FasterDEMA as DEMA,
  FasterWMA as WMA,
  FasterMOM as MOM,
} from "trading-signals";
import { getCandles, ICandleData, formatPrice, getDate } from "backtest-kit";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

/**
 * Maximum number of historical rows to return in analysis results.
 * Limits memory usage and table size for markdown reports.
 */
const TABLE_ROWS_LIMIT = 30;

/**
 * Minimum number of candles required before generating analysis rows.
 * Ensures all technical indicators (especially EMA(34)) have sufficient data.
 */
const WARMUP_PERIOD = 34;

interface ISwingTermRow {
  symbol: string;
  rsi14: number | null;
  stochasticRSI14: number | null;
  macd12_26_9: number | null;
  signal9: number | null;
  bollingerUpper20_2: number | null;
  bollingerMiddle20_2: number | null;
  bollingerLower20_2: number | null;
  bollingerWidth20_2: number | null;
  stochasticK14_3_3: number | null;
  stochasticD14_3_3: number | null;
  adx14: number | null;
  plusDI14: number | null;
  minusDI14: number | null;
  cci20: number | null;
  atr14: number | null;
  sma20: number | null;
  ema13: number | null;
  ema34: number | null;
  dema21: number | null;
  wma20: number | null;
  momentum8: number | null;
  support: number;
  resistance: number;
  currentPrice: number;
  volume: number;
  volatility: number | null;
  priceMomentum6: number | null;
  fibonacciNearestSupport: number | null;
  fibonacciNearestResistance: number | null;
  fibonacciPositionPercent: number | null;
  bodySize: number;
  closePrice: number;
  date: Date;
  lookbackPeriod: string;
}

interface Column {
  key: keyof ISwingTermRow;
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
    key: "atr14",
    label: "ATR(14)",
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
    key: "stochasticK14_3_3",
    label: "Stochastic K(14,3,3)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochasticD14_3_3",
    label: "Stochastic D(14,3,3)",
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
    key: "sma20",
    label: "SMA(20)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "ema13",
    label: "EMA(13)",
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
    key: "bollingerUpper20_2",
    label: "Bollinger Upper(20,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollingerMiddle20_2",
    label: "Bollinger Middle(20,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollingerLower20_2",
    label: "Bollinger Lower(20,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollingerWidth20_2",
    label: "Bollinger Width(20,2.0)",
    format: (v) => (v !== null ? `${Number(v).toFixed(2)}%` : "N/A"),
  },
  {
    key: "volume",
    label: "Volume",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "volatility",
    label: "Basic Volatility",
    format: (v) => (v !== null ? `${Number(v).toFixed(2)}%` : "N/A"),
  },
  {
    key: "priceMomentum6",
    label: "Price Momentum(6)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "fibonacciNearestSupport",
    label: "Fibonacci Nearest Support",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "fibonacciNearestResistance",
    label: "Fibonacci Nearest Resistance",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "fibonacciPositionPercent",
    label: "Fibonacci Position %",
    format: (v) => (v !== null ? `${Number(v).toFixed(2)}%` : "N/A"),
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
 * Calculates Fibonacci levels and determines nearest support/resistance levels.
 *
 * Computes Fibonacci retracement levels (0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%)
 * and extension levels (127.2%, 161.8%, 261.8%) over specified lookback period.
 * Identifies current price position relative to Fibonacci levels and finds
 * nearest support/resistance levels.
 *
 * @param candles - Array of candle data
 * @param endIndex - Index of current candle in array
 * @param period - Lookback period in candles (default: 48)
 * @returns Object with nearest support/resistance prices and current level description
 *
 * @example
 * ```typescript
 * const candles = await getCandles('BTCUSDT', '30m', 96);
 * const fib = calculateFibonacciLevels(candles, 95, 48);
 * console.log(fib);
 * // {
 * //   nearestSupport: 42000.50,
 * //   nearestResistance: 43500.25,
 * //   currentLevel: "50.0% Retracement"
 * // }
 * ```
 */
function calculateFibonacciLevels(
  candles: ICandleData[],
  endIndex: number,
  period: number = 48
): {
  nearestSupport: number | null;
  nearestResistance: number | null;
  fibonacciPositionPercent: number | null;
} {
  if (endIndex + 1 < period) {
    return {
      nearestSupport: null,
      nearestResistance: null,
      fibonacciPositionPercent: null,
    };
  }

  const startIdx = endIndex + 1 - period;
  const recentCandles = candles.slice(startIdx, endIndex + 1);
  const highs = recentCandles
    .map((c) => Number(c.high))
    .filter((h) => !isUnsafe(h));
  const lows = recentCandles
    .map((c) => Number(c.low))
    .filter((l) => !isUnsafe(l));

  if (highs.length === 0 || lows.length === 0) {
    return {
      nearestSupport: null,
      nearestResistance: null,
      fibonacciPositionPercent: null,
    };
  }

  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const range = high - low;
  const currentPrice = Number(candles[endIndex].close);

  // Calculate position as percentage from low to high (0% = low, 100% = high)
  const fibonacciPositionPercent = range > 0 ? ((currentPrice - low) / range) * 100 : null;

  const retracement = {
    level0: high,
    level236: high - range * 0.236,
    level382: high - range * 0.382,
    level500: high - range * 0.5,
    level618: high - range * 0.618,
    level786: high - range * 0.786,
    level1000: low,
  };

  const extension = {
    level1272: high + range * 0.272,
    level1618: high + range * 0.618,
    level2618: high + range * 1.618,
  };

  const allRetracementLevels = Object.values(retracement).filter(
    (level) => level !== null
  ) as number[];
  const allExtensionLevels = Object.values(extension).filter(
    (level) => level !== null && level > 0
  ) as number[];

  const resistanceLevels = [...allRetracementLevels, ...allExtensionLevels]
    .filter((level) => level > currentPrice)
    .sort((a, b) => a - b);

  const supportLevels = allRetracementLevels
    .filter((level) => level < currentPrice)
    .sort((a, b) => b - a);

  const nearestResistance =
    resistanceLevels.length > 0 ? resistanceLevels[0] : null;
  const nearestSupport = supportLevels.length > 0 ? supportLevels[0] : null;

  return {
    nearestSupport,
    nearestResistance,
    fibonacciPositionPercent,
  };
}

/**
 * Calculates support and resistance levels from recent high/low prices.
 *
 * Identifies support (minimum low) and resistance (maximum high) levels
 * over specified window period. Falls back to current price if insufficient data.
 *
 * @param candles - Array of candle data
 * @param endIndex - Index of current candle in array
 * @param window - Lookback window in candles (default: 20)
 * @returns Object with support and resistance price levels
 *
 * @example
 * ```typescript
 * const candles = await getCandles('ETHUSDT', '30m', 96);
 * const levels = calculateSupportResistance(candles, 95, 20);
 * console.log(levels);
 * // { support: 2200.50, resistance: 2350.75 }
 * ```
 */
function calculateSupportResistance(
  candles: ICandleData[],
  endIndex: number,
  window: number = 20
): { support: number; resistance: number } {
  const startIdx = Math.max(0, endIndex + 1 - window);
  const recentHighs = candles
    .slice(startIdx, endIndex + 1)
    .map((c) => Number(c.high))
    .filter((h) => !isUnsafe(h));
  const recentLows = candles
    .slice(startIdx, endIndex + 1)
    .map((c) => Number(c.low))
    .filter((l) => !isUnsafe(l));

  const currentPrice = Number(candles[endIndex].close);
  const support =
    recentLows.length > 0 ? Math.min(...recentLows) : currentPrice;
  const resistance =
    recentHighs.length > 0 ? Math.max(...recentHighs) : currentPrice;

  return { support, resistance };
}

/**
 * Generates comprehensive technical analysis for 30-minute candles (swing trading).
 *
 * Calculates 25+ technical indicators per candle including:
 * - Momentum: RSI(14), Stochastic RSI(14), MACD(12,26,9), Momentum(8), Price Momentum(6)
 * - Trend: SMA(20), EMA(13,34), DEMA(21), WMA(20), ADX(14), +DI/-DI
 * - Volatility: ATR(14), Bollinger Bands(20,2.0), calculated volatility
 * - Support/Resistance: Pivot points, Fibonacci levels with nearest support/resistance
 * - Volume analysis
 *
 * Skips first WARMUP_PERIOD (34) candles to ensure indicator stability.
 * Returns last TABLE_ROWS_LIMIT (30) rows for memory efficiency.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param candles - Array of 30-minute candle data
 * @returns Array of technical analysis rows with all indicators
 *
 * @example
 * ```typescript
 * const candles = await getCandles('BTCUSDT', '30m', 96);
 * const analysis = generateAnalysis('BTCUSDT', candles);
 * console.log(analysis[0].rsi14); // 52.45
 * console.log(analysis[0].fibonacciCurrentLevel); // "50.0% Retracement"
 * ```
 */
function generateAnalysis(
  symbol: string,
  candles: ICandleData[]
): ISwingTermRow[] {
  const closes = candles.map((candle) => Number(candle.close));
  const highs = candles.map((candle) => Number(candle.high));
  const lows = candles.map((candle) => Number(candle.low));
  const opens = candles.map((candle) => Number(candle.open));
  const volumes = candles.map((candle) => Number(candle.volume));

  const shortEMA = new EMA(12);
  const longEMA = new EMA(26);
  const signalEMA = new EMA(9);
  const macd = new MACD(shortEMA, longEMA, signalEMA);
  const rsi = new RSI(14);
  const stochasticRSI = new StochasticRSI(14);
  const bollinger = new BollingerBands(20, 2);
  const sma20 = new SMA(20);
  const ema13 = new EMA(13);
  const ema34 = new EMA(34);
  const dema21 = new DEMA(21);
  const wma20 = new WMA(20);
  const stochastic = new StochasticOscillator(14, 3, 3);
  const adx = new ADX(14);
  const dx = new DX(14);
  const cci = new CCI(20);
  const atr = new ATR(14);
  const momentum = new MOM(8);
  const priceMomentumIndicator = new MOM(6);

  const results: ISwingTermRow[] = [];

  candles.forEach((_candle, i) => {
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const open = opens[i];
    const volume = volumes[i];
    const currentPrice = close;

    // Update all indicators
    if (!isUnsafe(close) && close > 0) {
      macd.update(close, false);
      rsi.update(close, false);
      stochasticRSI.update(close, false);
      bollinger.update(close, false);
      sma20.update(close, false);
      ema13.update(close, false);
      ema34.update(close, false);
      dema21.update(close, false);
      wma20.update(close, false);
      momentum.update(close, false);
      priceMomentumIndicator.update(close, false);
    }

    if (
      !isUnsafe(high) &&
      !isUnsafe(low) &&
      !isUnsafe(close) &&
      high >= low &&
      close > 0
    ) {
      stochastic.update({ high, low, close }, false);
      adx.update({ high, low, close }, false);
      dx.update({ high, low, close }, false);
      cci.update({ high, low, close }, false);
      atr.update({ high, low, close }, false);
    }

    // Determine minimum warm-up period needed (largest indicator period)
    // EMA(34) is the largest period
    // Skip rows until all indicators are warmed up
    if (i < WARMUP_PERIOD) {
      return;
    }

    const priceChanges = closes
      .slice(0, i + 1)
      .slice(1)
      .map((price, idx) => {
        const prevPrice = closes.slice(0, i + 1)[idx];
        return ((price - prevPrice) / prevPrice) * 100;
      });
    const volatility =
      priceChanges.length > 0
        ? Math.sqrt(
            priceChanges.reduce((sum, change) => sum + change ** 2, 0) /
              priceChanges.length
          )
        : null;

    const { support, resistance } = calculateSupportResistance(candles, i);
    const fibonacci = calculateFibonacciLevels(candles, i);

    const macdResult = macd.getResult();
    const bollingerResult = bollinger.getResult();
    const stochasticResult = stochastic.getResult();
    const adxValue = adx.getResult() ?? null;
    const plusDI14 = !isUnsafe(dx.pdi) ? dx.pdi * 100 : null;
    const minusDI14 = !isUnsafe(dx.mdi) ? dx.mdi * 100 : null;

    const bollingerBandWidth =
      bollingerResult &&
      !isUnsafe(bollingerResult.upper) &&
      !isUnsafe(bollingerResult.lower) &&
      !isUnsafe(bollingerResult.middle) &&
      bollingerResult.middle !== 0
        ? ((bollingerResult.upper - bollingerResult.lower) /
            bollingerResult.middle) *
          100
        : null;

    const rsiValue = rsi.getResult() ?? null;
    const stochasticRSIResult = stochasticRSI.getResult();
    const stochasticRSIValue = !isUnsafe(stochasticRSIResult)
      ? stochasticRSIResult * 100
      : null;

    const bodySize = Math.abs(close - open);

    results.push({
      symbol,
      rsi14: rsiValue != null && !isUnsafe(rsiValue) ? rsiValue : null,
      stochasticRSI14: stochasticRSIValue,
      macd12_26_9:
        macdResult && !isUnsafe(macdResult.macd) ? macdResult.macd : null,
      signal9:
        macdResult && !isUnsafe(macdResult.signal) ? macdResult.signal : null,
      bollingerUpper20_2:
        bollingerResult && !isUnsafe(bollingerResult.upper)
          ? bollingerResult.upper
          : null,
      bollingerMiddle20_2:
        bollingerResult && !isUnsafe(bollingerResult.middle)
          ? bollingerResult.middle
          : null,
      bollingerLower20_2:
        bollingerResult && !isUnsafe(bollingerResult.lower)
          ? bollingerResult.lower
          : null,
      bollingerWidth20_2: bollingerBandWidth,
      stochasticK14_3_3:
        stochasticResult && !isUnsafe(stochasticResult.stochK)
          ? stochasticResult.stochK
          : null,
      stochasticD14_3_3:
        stochasticResult && !isUnsafe(stochasticResult.stochD)
          ? stochasticResult.stochD
          : null,
      adx14: adxValue != null && !isUnsafe(adxValue) ? adxValue : null,
      plusDI14: plusDI14 != null && !isUnsafe(plusDI14) ? plusDI14 : null,
      minusDI14: minusDI14 != null && !isUnsafe(minusDI14) ? minusDI14 : null,
      cci20:
        cci.getResult() != null && !isUnsafe(cci.getResult())
          ? cci.getResult()
          : null,
      atr14:
        atr.getResult() != null && !isUnsafe(atr.getResult())
          ? atr.getResult()
          : null,
      sma20:
        sma20.getResult() != null && !isUnsafe(sma20.getResult())
          ? sma20.getResult()
          : null,
      ema13:
        ema13.getResult() != null && !isUnsafe(ema13.getResult())
          ? ema13.getResult()
          : null,
      ema34:
        ema34.getResult() != null && !isUnsafe(ema34.getResult())
          ? ema34.getResult()
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
      volume: volume != null && !isUnsafe(volume) ? volume : null,
      volatility,
      priceMomentum6:
        priceMomentumIndicator.getResult() != null &&
        !isUnsafe(priceMomentumIndicator.getResult())
          ? priceMomentumIndicator.getResult()
          : null,
      fibonacciNearestSupport: fibonacci.nearestSupport,
      fibonacciNearestResistance: fibonacci.nearestResistance,
      fibonacciPositionPercent: fibonacci.fibonacciPositionPercent,
      bodySize,
      closePrice: close,
      date: new Date(),
      lookbackPeriod: "96 candles (48 hours)",
    });
  });

  // Return only the last TABLE_ROWS_LIMIT rows
  return results.slice(-TABLE_ROWS_LIMIT);
}

/**
 * Generates markdown table with swing trading technical analysis history.
 *
 * Creates comprehensive markdown report with:
 * - Formatted table of all technical indicators
 * - Column headers with indicator names and parameters
 * - Formatted values (prices in USD, percentages, decimals)
 * - Data sources section explaining each indicator's calculation
 * - Timeframe and lookback period documentation (30m candles, 48h lookback)
 *
 * Output is optimized for LLM consumption in swing trading signal generation.
 *
 * @param indicators - Array of analysis rows from generateAnalysis()
 * @param symbol - Trading pair symbol for price formatting
 * @returns Markdown-formatted technical analysis report
 *
 * @example
 * ```typescript
 * const rows = await service.getData('BTCUSDT', candles);
 * const markdown = await generateHistoryTable(rows, 'BTCUSDT');
 * console.log(markdown);
 * // # 30-Min Candles Analysis for BTCUSDT (Historical Data)
 * // > Current time: 2025-01-14T10:30:00.000Z
 * // | RSI(14) | MACD(12,26,9) | Fibonacci Current Level | ... |
 * ```
 */
async function generateHistoryTable(
  indicators: ISwingTermRow[],
  symbol: string
): Promise<string> {
  let markdown = "";
  const currentData = await getDate();
  markdown += `# 30-Min Candles Analysis for ${symbol} (Historical Data)\n`;
  markdown += `> Current trading pair: ${String(symbol).toUpperCase()} Current datetime: ${currentData.toISOString()}\n\n`;

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
  markdown += "- **Timeframe**: 30-minute candles\n";
  markdown += "- **Lookback Period**: 96 candles (48 hours)\n";
  markdown +=
    "- **RSI(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic RSI(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **MACD(12,26,9)**: fast 12 and slow 26 periods on 30m timeframe before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **Signal(9)**: over previous 9 candles (4.5 hours on 30m timeframe) before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **ADX(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **+DI(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **-DI(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **ATR(14)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **CCI(20)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **Bollinger Upper(20,2.0)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Middle(20,2.0)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Lower(20,2.0)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Width(20,2.0)**: width percentage before row timestamp (Min: 0%, Max: +∞)\n";
  markdown +=
    "- **Stochastic K(14,3,3)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic D(14,3,3)**: over previous 14 candles (7 hours on 30m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **DEMA(21)**: over previous 21 candles (10.5 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **WMA(20)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **SMA(20)**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **EMA(13)**: over previous 13 candles (6.5 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **EMA(34)**: over previous 34 candles (17 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Momentum(8)**: over previous 8 candles (4 hours on 30m timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)\n";
  markdown +=
    "- **Support**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Resistance**: over previous 20 candles (10 hours on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Price Momentum(6)**: over previous 6 candles (3 hours on 30m timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)\n";
  markdown +=
    "- **Fibonacci Nearest Support**: nearest support level over 48 candles (24h on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Fibonacci Nearest Resistance**: nearest resistance level over 48 candles (24h on 30m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Fibonacci Position %**: price position in high-low range before row timestamp (Min: 0%, Max: 100%+)\n";
  markdown +=
    "- **Current Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Body Size**: candle body size at row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Close Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Volume**: trading volume at row timestamp (Min: 0, Max: +∞)\n";
  markdown +=
    "- **Volatility**: volatility percentage at row timestamp (Min: 0%, Max: +∞)\n";

  return markdown;
}

/**
 * Service for swing-term (30-minute) technical analysis and markdown report generation.
 *
 * Provides comprehensive technical analysis for 30-minute candles with 25+ indicators
 * including momentum (RSI, MACD), trend (EMA, SMA), volatility (ATR, Bollinger Bands),
 * support/resistance levels, and Fibonacci analysis with nearest support/resistance.
 *
 * Key features:
 * - 25+ technical indicators (RSI, MACD, Bollinger Bands, Stochastic, ADX, etc.)
 * - Support/resistance level detection
 * - Fibonacci retracement and extension analysis with nearest levels
 * - Volume and volatility analysis
 * - Price momentum tracking
 * - Markdown table generation for LLM consumption
 * - Intelligent indicator warmup (skips first 34 candles)
 * - Memory-efficient output (last 30 rows only)
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { SwingTermHistoryService } from '@backtest-kit/signals';
 *
 * const service = new SwingTermHistoryService();
 *
 * // Get markdown report for symbol (fetches candles internally)
 * const report = await service.getReport('BTCUSDT');
 * console.log(report); // Markdown table with all indicators
 *
 * // Or analyze custom candles
 * const candles = await getCandles('ETHUSDT', '30m', 96);
 * const rows = await service.getData('ETHUSDT', candles);
 * console.log(rows[0].rsi14); // 52.45
 * console.log(rows[0].fibonacciCurrentLevel); // "50.0% Retracement"
 * ```
 */
export class SwingTermHistoryService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Analyzes candle data and returns technical indicator rows.
   *
   * Calculates all technical indicators for provided candles, skips first WARMUP_PERIOD
   * rows to ensure stability, and returns last TABLE_ROWS_LIMIT rows.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param candles - Array of 30-minute candle data
   * @returns Array of technical analysis rows with all indicators
   *
   * @example
   * ```typescript
   * const candles = await getCandles('BTCUSDT', '30m', 96);
   * const rows = await service.getData('BTCUSDT', candles);
   * console.log(rows.length); // Up to 30 rows
   * console.log(rows[0].rsi14); // 52.45
   * console.log(rows[0].fibonacciNearestSupport); // 42000.50
   * ```
   */
  public getData = async (
    symbol: string,
    candles: ICandleData[]
  ): Promise<ISwingTermRow[]> => {
    this.loggerService.log("swingTermHistoryService getData", {
      symbol,
      candles: candles.length,
    });
    return generateAnalysis(symbol, candles);
  };

  /**
   * Generates complete markdown technical analysis report for a symbol.
   *
   * Fetches 96 30-minute candles (48 hours) from exchange, calculates all indicators,
   * and formats results as markdown table optimized for LLM consumption.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @returns Markdown-formatted technical analysis report with table and explanations
   *
   * @example
   * ```typescript
   * const report = await service.getReport('BTCUSDT');
   * console.log(report);
   * // # 30-Min Candles Analysis for BTCUSDT (Historical Data)
   * // > Current time: 2025-01-14T10:30:00.000Z
   * //
   * // | RSI(14) | MACD(12,26,9) | Fibonacci Current Level | ...
   * // | 52.45 | 0.0023 | 50.0% Retracement | ...
   * ```
   */
  public getReport = async (symbol: string): Promise<string> => {
    this.loggerService.log("swingTermHistoryService getReport", { symbol });
    const candles: ICandleData[] = await getCandles(symbol, "30m", 96);
    const rows = await this.getData(symbol, candles);
    return generateHistoryTable(rows, symbol);
  };

  /**
   * Converts analysis rows into markdown table format.
   *
   * Takes pre-calculated indicator rows and formats them as markdown table
   * with column headers, formatted values, and data source explanations.
   *
   * @param symbol - Trading pair symbol for price formatting
   * @param rows - Array of technical analysis rows from getData()
   * @returns Markdown-formatted table with all indicators
   *
   * @example
   * ```typescript
   * const candles = await getCandles('BTCUSDT', '30m', 96);
   * const rows = await service.getData('BTCUSDT', candles);
   * const markdown = await service.generateHistoryTable('BTCUSDT', rows);
   * console.log(markdown); // Markdown table
   * ```
   */
  public generateHistoryTable = async (
    symbol: string,
    rows: ISwingTermRow[]
  ): Promise<string> => {
    this.loggerService.log("swingTermHistoryService generateHistoryTable", {
      symbol,
      rowCount: rows.length,
    });
    return generateHistoryTable(rows, symbol);
  };
}

export default SwingTermHistoryService;
