/**
 * MicroTerm (1-minute) technical analysis service for scalping strategies.
 *
 * Generates 40+ indicators on 1-minute candles with 60-candle lookback.
 * Optimized for high-frequency trading and sub-5 minute positions.
 *
 * Indicators: RSI(9,14), StochRSI(9,14), MACD(8,21,5), Bollinger(8,2), Stochastic(3,5),
 * ADX(9), ATR(5,9), CCI(9), Momentum(5,10), ROC(1,3,5), EMA(3,8,13,21), SMA(8), DEMA(8),
 * WMA(5), Support/Resistance, Volume analysis, Squeeze momentum.
 *
 * Used by commitMicroTermMath().
 */

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
import { getCandles, ICandleData, formatPrice, getDate } from "backtest-kit";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

/**
 * Minimum number of candles required before generating analysis rows.
 * Ensures all technical indicators (especially EMA(21)) have sufficient data.
 */
const WARMUP_PERIOD = 21;

/**
 * Maximum number of historical rows to return in analysis results.
 * Limits memory usage and table size for markdown reports.
 */
const TABLE_ROWS_LIMIT = 40;

interface IMicroTermRow {
  symbol: string;
  rsi9: number | null;
  rsi14: number | null;
  stochasticRSI9: number | null;
  stochasticRSI14: number | null;
  macd8_21_5: number | null;
  signal5: number | null;
  macdHistogram: number | null;
  bollingerUpper8_2: number | null;
  bollingerMiddle8_2: number | null;
  bollingerLower8_2: number | null;
  bollingerWidth8_2: number | null;
  bollingerPosition: number | null;
  stochasticK3_3_3: number | null;
  stochasticD3_3_3: number | null;
  stochasticK5_3_3: number | null;
  stochasticD5_3_3: number | null;
  adx9: number | null;
  plusDI9: number | null;
  minusDI9: number | null;
  atr5: number | null;
  atr9: number | null;
  cci9: number | null;
  momentum5: number | null;
  momentum10: number | null;
  roc1: number | null;
  roc3: number | null;
  roc5: number | null;
  ema3: number | null;
  ema8: number | null;
  ema13: number | null;
  ema21: number | null;
  sma8: number | null;
  dema8: number | null;
  wma5: number | null;
  volumeSma5: number | null;
  volumeRatio: number | null;
  volumeTrendRatio: number | null;
  currentPrice: number;
  priceChange1m: number | null;
  priceChange3m: number | null;
  priceChange5m: number | null;
  volatility5: number | null;
  trueRange: number | null;
  support: number;
  resistance: number;
  squeezeMomentum: number | null;
  pressureIndex: number | null;
  closePrice: number;
  date: Date;
  lookbackPeriod: string;
}

interface Column {
  key: keyof IMicroTermRow;
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
    key: "rsi14",
    label: "RSI(14)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochasticRSI9",
    label: "Stochastic RSI(9)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochasticRSI14",
    label: "Stochastic RSI(14)",
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
    key: "macdHistogram",
    label: "MACD Histogram",
    format: (v) => (v !== null ? Number(v).toFixed(4) : "N/A"),
  },
  {
    key: "adx9",
    label: "ADX(9)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "plusDI9",
    label: "+DI(9)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "minusDI9",
    label: "-DI(9)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "atr5",
    label: "ATR(5)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
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
    key: "cci9",
    label: "CCI(9)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochasticK3_3_3",
    label: "Stochastic K(3,3,3)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "stochasticD3_3_3",
    label: "Stochastic D(3,3,3)",
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
    key: "momentum5",
    label: "Momentum(5)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "momentum10",
    label: "Momentum(10)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "roc1",
    label: "ROC(1)",
    format: (v) => (v !== null ? `${Number(v).toFixed(3)}%` : "N/A"),
  },
  {
    key: "roc3",
    label: "ROC(3)",
    format: (v) => (v !== null ? `${Number(v).toFixed(3)}%` : "N/A"),
  },
  {
    key: "roc5",
    label: "ROC(5)",
    format: (v) => (v !== null ? `${Number(v).toFixed(3)}%` : "N/A"),
  },
  {
    key: "ema3",
    label: "EMA(3)",
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
    key: "ema13",
    label: "EMA(13)",
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
    key: "sma8",
    label: "SMA(8)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "dema8",
    label: "DEMA(8)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "wma5",
    label: "WMA(5)",
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
    key: "priceChange1m",
    label: "1m Change",
    format: (v) => (v !== null ? `${Number(v).toFixed(3)}%` : "N/A"),
  },
  {
    key: "priceChange3m",
    label: "3m Change",
    format: (v) => (v !== null ? `${Number(v).toFixed(3)}%` : "N/A"),
  },
  {
    key: "priceChange5m",
    label: "5m Change",
    format: (v) => (v !== null ? `${Number(v).toFixed(3)}%` : "N/A"),
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
    key: "bollingerUpper8_2",
    label: "Bollinger Upper(8,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollingerMiddle8_2",
    label: "Bollinger Middle(8,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollingerLower8_2",
    label: "Bollinger Lower(8,2.0)",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "bollingerWidth8_2",
    label: "Bollinger Width(8,2.0)",
    format: (v) => (v !== null ? `${Number(v).toFixed(3)}%` : "N/A"),
  },
  {
    key: "bollingerPosition",
    label: "Bollinger Position",
    format: (v) => (v !== null ? `${Number(v).toFixed(1)}%` : "N/A"),
  },
  {
    key: "volumeSma5",
    label: "Volume SMA(5)",
    format: (v) => (v !== null ? Number(v).toFixed(2) : "N/A"),
  },
  {
    key: "volumeRatio",
    label: "Volume Ratio",
    format: (v) => (v !== null ? `${Number(v).toFixed(2)}x` : "N/A"),
  },
  {
    key: "volatility5",
    label: "Volatility(5)",
    format: (v) => (v !== null ? `${Number(v).toFixed(3)}%` : "N/A"),
  },
  {
    key: "trueRange",
    label: "True Range",
    format: async (v, symbol) =>
      v !== null
        ? `${await formatPrice(symbol, Number(v))} USD`
        : "N/A",
  },
  {
    key: "squeezeMomentum",
    label: "Squeeze Momentum",
    format: (v) => (v !== null ? Number(v).toFixed(3) : "N/A"),
  },
  {
    key: "pressureIndex",
    label: "Pressure Index",
    format: (v) => (v !== null ? `${Number(v).toFixed(1)}%` : "N/A"),
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
 * Calculates volume metrics including SMA, ratio, and trend.
 *
 * Computes volume SMA(5), current volume to average ratio, and volume trend
 * by comparing recent 3 candles to previous 3 candles. Returns "increasing"
 * if recent average > 120% of previous, "decreasing" if < 80%, else "stable".
 *
 * @param candles - Array of candle data
 * @param endIndex - Index of current candle in array
 * @returns Object with volumeSma5, volumeRatio, and volumeTrend
 *
 * @example
 * ```typescript
 * const candles = await getCandles('BTCUSDT', '1m', 60);
 * const metrics = calculateVolumeMetrics(candles, 59);
 * console.log(metrics);
 * // { volumeSma5: 1500000, volumeRatio: 1.25, volumeTrend: "increasing" }
 * ```
 */
function calculateVolumeMetrics(
  candles: ICandleData[],
  endIndex: number
): {
  volumeSma5: number | null;
  volumeRatio: number | null;
  volumeTrendRatio: number | null;
} {
  const volumes = candles.slice(0, endIndex + 1).map((c) => Number(c.volume));

  if (volumes.length < 5) {
    return { volumeSma5: null, volumeRatio: null, volumeTrendRatio: null };
  }

  const volumeSma5 = new SMA(5);
  volumes.forEach((vol) => volumeSma5.update(vol, false));
  const avgVolumeRaw = volumeSma5.getResult();
  const avgVolume = !isUnsafe(avgVolumeRaw) ? avgVolumeRaw : 0;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio =
    avgVolume > 0 && !isUnsafe(currentVolume) ? currentVolume / avgVolume : 1;

  let volumeTrendRatio: number | null = null;

  if (volumes.length >= 6) {
    const recent3 = volumes.slice(-3);
    const prev3 = volumes.slice(-6, -3);
    if (prev3.length >= 3) {
      const recentAvg = recent3.reduce((a, b) => a + b, 0) / 3;
      const prevAvg = prev3.reduce((a, b) => a + b, 0) / 3;

      volumeTrendRatio = prevAvg > 0 ? recentAvg / prevAvg : null;
    }
  }

  return { volumeSma5: avgVolume, volumeRatio, volumeTrendRatio };
}

/**
 * Calculates price change percentages over 1, 3, and 5 minute periods.
 *
 * Computes percentage price changes from current price to prices at
 * 1, 3, and 5 candles ago. Returns null for periods with insufficient data.
 *
 * @param candles - Array of candle data
 * @param endIndex - Index of current candle in array
 * @returns Object with priceChange1m, priceChange3m, and priceChange5m percentages
 *
 * @example
 * ```typescript
 * const candles = await getCandles('BTCUSDT', '1m', 60);
 * const changes = calculatePriceChanges(candles, 59);
 * console.log(changes);
 * // { priceChange1m: 0.05, priceChange3m: 0.12, priceChange5m: -0.08 }
 * ```
 */
function calculatePriceChanges(
  candles: ICandleData[],
  endIndex: number
): {
  priceChange1m: number | null;
  priceChange3m: number | null;
  priceChange5m: number | null;
} {
  const closes = candles.slice(0, endIndex + 1).map((c) => Number(c.close));

  if (closes.length < 2) {
    return { priceChange1m: null, priceChange3m: null, priceChange5m: null };
  }

  const current = closes[closes.length - 1];

  const priceChange1m =
    closes.length >= 2
      ? ((current - closes[closes.length - 2]) / closes[closes.length - 2]) *
        100
      : null;

  const priceChange3m =
    closes.length >= 4
      ? ((current - closes[closes.length - 4]) / closes[closes.length - 4]) *
        100
      : null;

  const priceChange5m =
    closes.length >= 6
      ? ((current - closes[closes.length - 6]) / closes[closes.length - 6]) *
        100
      : null;

  return { priceChange1m, priceChange3m, priceChange5m };
}

/**
 * Calculates support and resistance levels from recent high/low prices.
 *
 * Identifies support (minimum low) and resistance (maximum high) levels
 * over last 30 candles. Uses minimum distance threshold (0.3% of current price)
 * to filter significant levels. Falls back to current price if insufficient data.
 *
 * @param candles - Array of candle data
 * @param endIndex - Index of current candle in array
 * @param currentPrice - Current price for distance calculations
 * @returns Object with support and resistance price levels
 *
 * @example
 * ```typescript
 * const candles = await getCandles('BTCUSDT', '1m', 60);
 * const levels = calculateSupportResistance(candles, 59, 42500);
 * console.log(levels);
 * // { support: 42400.50, resistance: 42600.75 }
 * ```
 */
function calculateSupportResistance(
  candles: ICandleData[],
  endIndex: number,
  currentPrice: number
): {
  support: number;
  resistance: number;
} {
  const recentPeriod = Math.min(30, endIndex + 1);
  const startIdx = endIndex + 1 - recentPeriod;
  const recentCandles = candles.slice(startIdx, endIndex + 1);

  if (recentCandles.length < 10) {
    return { support: currentPrice, resistance: currentPrice };
  }

  const highs = recentCandles.map((c) => Number(c.high));
  const lows = recentCandles.map((c) => Number(c.low));

  const minDistance = currentPrice * 0.003;

  const significantHighs = [...highs]
    .filter((h) => !isUnsafe(h) && h > currentPrice + minDistance)
    .sort((a, b) => a - b);
  const significantLows = [...lows]
    .filter((l) => !isUnsafe(l) && l < currentPrice - minDistance)
    .sort((a, b) => b - a);

  const safeHighs = highs.filter((h) => !isUnsafe(h));
  const safeLows = lows.filter((l) => !isUnsafe(l));
  const resistance =
    significantHighs.length > 0
      ? significantHighs[0]
      : safeHighs.length > 0
      ? Math.max(...safeHighs)
      : currentPrice;
  const support =
    significantLows.length > 0
      ? significantLows[0]
      : safeLows.length > 0
      ? Math.min(...safeLows)
      : currentPrice;

  return { support, resistance };
}

/**
 * Generates comprehensive technical analysis for 1-minute candles (scalping).
 *
 * Calculates 40+ technical indicators per candle including:
 * - Momentum: RSI(9,14), Stochastic RSI(9,14), MACD(8,21,5), Momentum(5,10), ROC(1,3,5)
 * - Trend: EMA(3,8,13,21), SMA(8), DEMA(8), WMA(5), ADX(9), +DI/-DI
 * - Volatility: ATR(5,9), Bollinger Bands(8,2.0), volatility(5), true range
 * - Volume: Volume SMA(5), volume ratio, volume trend
 * - Support/Resistance: Pivot points over 30 candles
 * - Special: Squeeze momentum, pressure index, Bollinger position
 *
 * Skips first WARMUP_PERIOD (21) candles to ensure indicator stability.
 * Returns last TABLE_ROWS_LIMIT (40) rows for memory efficiency.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param candles - Array of 1-minute candle data
 * @returns Array of technical analysis rows with all indicators
 *
 * @example
 * ```typescript
 * const candles = await getCandles('BTCUSDT', '1m', 60);
 * const analysis = generateAnalysis('BTCUSDT', candles);
 * console.log(analysis[0].rsi9); // 45.23
 * console.log(analysis[0].squeezeMomentum); // 1.25
 * ```
 */
function generateAnalysis(
  symbol: string,
  candles: ICandleData[]
): IMicroTermRow[] {
  const closes = candles.map((candle) => Number(candle.close));
  const highs = candles.map((candle) => Number(candle.high));
  const lows = candles.map((candle) => Number(candle.low));
  const opens = candles.map((candle) => Number(candle.open));

  const rsi9 = new RSI(9);
  const rsi14 = new RSI(14);
  const stochasticRSI9 = new StochasticRSI(9);
  const stochasticRSI14 = new StochasticRSI(14);
  const macdShortEMA = new EMA(8);
  const macdLongEMA = new EMA(21);
  const macdSignalEMA = new EMA(5);
  const macd = new MACD(macdShortEMA, macdLongEMA, macdSignalEMA);
  const bollinger8 = new BollingerBands(8, 2.0);
  const stochastic3 = new StochasticOscillator(3, 3, 3);
  const stochastic5 = new StochasticOscillator(5, 3, 3);
  const adx9 = new ADX(9);
  const atr5 = new ATR(5);
  const atr9 = new ATR(9);
  const cci9 = new CCI(9);
  const momentum5 = new MOM(5);
  const momentum10 = new MOM(10);
  const roc1 = new ROC(1);
  const roc3 = new ROC(3);
  const roc5 = new ROC(5);
  const ema3 = new EMA(3);
  const ema8 = new EMA(8);
  const ema13 = new EMA(13);
  const ema21 = new EMA(21);
  const sma8 = new SMA(8);
  const dema8 = new DEMA(8);
  const wma5 = new WMA(5);

  const results: IMicroTermRow[] = [];

  candles.forEach((_candle, i) => {
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const open = opens[i];
    const currentPrice = close;

    // Update all indicators
    rsi9.update(close, false);
    rsi14.update(close, false);
    stochasticRSI9.update(close, false);
    stochasticRSI14.update(close, false);
    macd.update(close, false);
    bollinger8.update(close, false);
    stochastic3.update({ high, low, close }, false);
    stochastic5.update({ high, low, close }, false);
    adx9.update({ high, low, close }, false);
    atr5.update({ high, low, close }, false);
    atr9.update({ high, low, close }, false);
    cci9.update({ high, low, close }, false);
    momentum5.update(close, false);
    momentum10.update(close, false);
    roc1.update(close, false);
    roc3.update(close, false);
    roc5.update(close, false);
    ema3.update(close, false);
    ema8.update(close, false);
    ema13.update(close, false);
    ema21.update(close, false);
    sma8.update(close, false);
    dema8.update(close, false);
    wma5.update(close, false);
    
    // Determine minimum warm-up period needed (largest indicator period)
    // EMA(21) is the largest period
    // Skip rows until all indicators are warmed up
    if (i < WARMUP_PERIOD) {
      return;
    }

    const volumeMetrics = calculateVolumeMetrics(candles, i);
    const priceChanges = calculatePriceChanges(candles, i);
    const { support, resistance } = calculateSupportResistance(
      candles,
      i,
      currentPrice
    );

    const volatility5 =
      i >= 4
        ? Math.sqrt(
            candles.slice(i - 4, i + 1).reduce((sum, c, idx, arr) => {
              if (idx === 0) return 0;
              const prevClose = Number(arr[idx - 1].close);
              const currentClose = Number(c.close);
              const return_ = Math.log(currentClose / prevClose);
              return sum + return_ * return_;
            }, 0) / 4
          ) * 100
        : null;

    const trueRange =
      i >= 1
        ? Math.max(
            high - low,
            Math.abs(high - closes[i - 1]),
            Math.abs(low - closes[i - 1])
          )
        : null;

    const rsi9Value = rsi9.getResult() ?? null;
    const rsi14Value = rsi14.getResult() ?? null;
    const stochasticRSI9Result = stochasticRSI9.getResult();
    const stochasticRSI9Value = !isUnsafe(stochasticRSI9Result)
      ? stochasticRSI9Result * 100
      : null;
    const stochasticRSI14Result = stochasticRSI14.getResult();
    const stochasticRSI14Value = !isUnsafe(stochasticRSI14Result)
      ? stochasticRSI14Result * 100
      : null;

    const macdResult = macd.getResult();
    const bollingerResult = bollinger8.getResult();
    const stochastic3Result = stochastic3.getResult();
    const stochastic5Result = stochastic5.getResult();
    const adx9Value = adx9.getResult() ?? null;
    const plusDI9 = typeof adx9.pdi === "number" ? adx9.pdi * 100 : null;
    const minusDI9 = typeof adx9.mdi === "number" ? adx9.mdi * 100 : null;

    const bollingerUpper8_2 =
      bollingerResult && !isUnsafe(bollingerResult.upper)
        ? bollingerResult.upper
        : null;
    const bollingerMiddle8_2 =
      bollingerResult && !isUnsafe(bollingerResult.middle)
        ? bollingerResult.middle
        : null;
    const bollingerLower8_2 =
      bollingerResult && !isUnsafe(bollingerResult.lower)
        ? bollingerResult.lower
        : null;

    let bollingerPosition: number | null = null;
    if (
      !isUnsafe(bollingerUpper8_2) &&
      !isUnsafe(bollingerLower8_2) &&
      !isUnsafe(currentPrice)
    ) {
      const range = bollingerUpper8_2 - bollingerLower8_2;
      if (range > 0 && !isUnsafe(range)) {
        bollingerPosition = ((currentPrice - bollingerLower8_2) / range) * 100;
      }
    }

    const bollingerWidth8_2 =
      !isUnsafe(bollingerUpper8_2) &&
      !isUnsafe(bollingerLower8_2) &&
      !isUnsafe(bollingerMiddle8_2) &&
      bollingerMiddle8_2 !== 0
        ? ((bollingerUpper8_2 - bollingerLower8_2) / bollingerMiddle8_2) * 100
        : null;

    const atr9Value = atr9.getResult() ?? null;
    const squeezeMomentum =
      !isUnsafe(bollingerWidth8_2) &&
      !isUnsafe(atr9Value) &&
      !isUnsafe(currentPrice) &&
      currentPrice !== 0
        ? bollingerWidth8_2 / ((atr9Value / currentPrice) * 100)
        : null;

    let pressureIndex: number | null = null;
    if (i >= 1) {
      const range = high - low;
      if (!isUnsafe(range) && range > 0) {
        pressureIndex = ((close - low - (high - close)) / range) * 100;
      }
    }

    results.push({
      symbol,
      rsi9: rsi9Value != null && !isUnsafe(rsi9Value) ? rsi9Value : null,
      rsi14: rsi14Value != null && !isUnsafe(rsi14Value) ? rsi14Value : null,
      stochasticRSI9: stochasticRSI9Value,
      stochasticRSI14: stochasticRSI14Value,
      macd8_21_5:
        macdResult && !isUnsafe(macdResult.macd) ? macdResult.macd : null,
      signal5:
        macdResult && !isUnsafe(macdResult.signal) ? macdResult.signal : null,
      macdHistogram:
        macdResult && !isUnsafe(macdResult.histogram)
          ? macdResult.histogram
          : null,
      bollingerUpper8_2,
      bollingerMiddle8_2,
      bollingerLower8_2,
      bollingerWidth8_2,
      bollingerPosition,
      stochasticK3_3_3:
        stochastic3Result && !isUnsafe(stochastic3Result.stochK)
          ? stochastic3Result.stochK
          : null,
      stochasticD3_3_3:
        stochastic3Result && !isUnsafe(stochastic3Result.stochD)
          ? stochastic3Result.stochD
          : null,
      stochasticK5_3_3:
        stochastic5Result && !isUnsafe(stochastic5Result.stochK)
          ? stochastic5Result.stochK
          : null,
      stochasticD5_3_3:
        stochastic5Result && !isUnsafe(stochastic5Result.stochD)
          ? stochastic5Result.stochD
          : null,
      adx9: adx9Value != null && !isUnsafe(adx9Value) ? adx9Value : null,
      plusDI9: plusDI9 != null && !isUnsafe(plusDI9) ? plusDI9 : null,
      minusDI9: minusDI9 != null && !isUnsafe(minusDI9) ? minusDI9 : null,
      atr5:
        atr5.getResult() != null && !isUnsafe(atr5.getResult())
          ? atr5.getResult()
          : null,
      atr9: atr9Value != null && !isUnsafe(atr9Value) ? atr9Value : null,
      cci9:
        cci9.getResult() != null && !isUnsafe(cci9.getResult())
          ? cci9.getResult()
          : null,
      momentum5:
        momentum5.getResult() != null && !isUnsafe(momentum5.getResult())
          ? momentum5.getResult()
          : null,
      momentum10:
        momentum10.getResult() != null && !isUnsafe(momentum10.getResult())
          ? momentum10.getResult()
          : null,
      roc1:
        roc1.getResult() != null && !isUnsafe(roc1.getResult())
          ? roc1.getResult()
          : null,
      roc3:
        roc3.getResult() != null && !isUnsafe(roc3.getResult())
          ? roc3.getResult()
          : null,
      roc5:
        roc5.getResult() != null && !isUnsafe(roc5.getResult())
          ? roc5.getResult()
          : null,
      ema3:
        ema3.getResult() != null && !isUnsafe(ema3.getResult())
          ? ema3.getResult()
          : null,
      ema8:
        ema8.getResult() != null && !isUnsafe(ema8.getResult())
          ? ema8.getResult()
          : null,
      ema13:
        ema13.getResult() != null && !isUnsafe(ema13.getResult())
          ? ema13.getResult()
          : null,
      ema21:
        ema21.getResult() != null && !isUnsafe(ema21.getResult())
          ? ema21.getResult()
          : null,
      sma8:
        sma8.getResult() != null && !isUnsafe(sma8.getResult())
          ? sma8.getResult()
          : null,
      dema8:
        dema8.getResult() != null && !isUnsafe(dema8.getResult())
          ? dema8.getResult()
          : null,
      wma5:
        wma5.getResult() != null && !isUnsafe(wma5.getResult())
          ? wma5.getResult()
          : null,
      volumeSma5: volumeMetrics.volumeSma5,
      volumeRatio: volumeMetrics.volumeRatio,
      volumeTrendRatio: volumeMetrics.volumeTrendRatio,
      currentPrice:
        currentPrice != null && !isUnsafe(currentPrice) ? currentPrice : null,
      priceChange1m: priceChanges.priceChange1m,
      priceChange3m: priceChanges.priceChange3m,
      priceChange5m: priceChanges.priceChange5m,
      volatility5,
      trueRange,
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
      squeezeMomentum,
      pressureIndex,
      closePrice: close,
      date: new Date(),
      lookbackPeriod: "60 candles (60 minutes)",
    });
  });

  // Return only the last TABLE_ROWS_LIMIT rows
  return results.slice(-TABLE_ROWS_LIMIT);
}

/**
 * Generates markdown table with micro-term technical analysis history.
 *
 * Creates comprehensive markdown report with:
 * - Formatted table of all 40+ technical indicators
 * - Column headers with indicator names and parameters
 * - Formatted values (prices in USD, percentages, decimals)
 * - Data sources section explaining each indicator's calculation
 * - Timeframe and lookback period documentation (1m candles, 60m lookback)
 *
 * Output is optimized for LLM consumption in scalping signal generation.
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
 * // # 1-Minute Candles Trading Analysis for BTCUSDT (Historical Data)
 * // > Current time: 2025-01-14T10:30:00.000Z
 * // | RSI(9) | MACD(8,21,5) | Squeeze Momentum | ... |
 * ```
 */
async function generateHistoryTable(
  indicators: IMicroTermRow[],
  symbol: string
): Promise<string> {
  let markdown = "";
  const currentData = await getDate();
  markdown += `# 1-Minute Candles Trading Analysis for ${symbol} (Historical Data)\n`;
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
  markdown += "- **Timeframe**: 1-minute candles\n";
  markdown += "- **Lookback Period**: 60 candles (60 minutes)\n";
  markdown +=
    "- **RSI(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **RSI(14)**: over previous 14 candles (14 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic RSI(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic RSI(14)**: over previous 14 candles (14 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **MACD(8,21,5)**: fast 8 and slow 21 periods on 1m timeframe before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **Signal(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **MACD Histogram**: histogram value before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **ADX(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **+DI(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **-DI(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **ATR(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **ATR(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **CCI(9)**: over previous 9 candles (9 minutes on 1m timeframe) before row timestamp (Min: -∞, Max: +∞)\n";
  markdown +=
    "- **Bollinger Upper(8,2.0)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Middle(8,2.0)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Lower(8,2.0)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Bollinger Width(8,2.0)**: width percentage before row timestamp (Min: 0%, Max: +∞)\n";
  markdown +=
    "- **Bollinger Position**: price position within bands before row timestamp (Min: 0%, Max: 100%)\n";
  markdown +=
    "- **Stochastic K(3,3,3)**: over previous 3 candles (3 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic D(3,3,3)**: over previous 3 candles (3 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic K(5,3,3)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Stochastic D(5,3,3)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0, Max: 100)\n";
  markdown +=
    "- **Momentum(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)\n";
  markdown +=
    "- **Momentum(10)**: over previous 10 candles (10 minutes on 1m timeframe) before row timestamp (Min: -∞ USD, Max: +∞ USD)\n";
  markdown +=
    "- **ROC(1)**: over previous 1 candle (1 minute on 1m timeframe) before row timestamp (Min: -∞%, Max: +∞%)\n";
  markdown +=
    "- **ROC(3)**: over previous 3 candles (3 minutes on 1m timeframe) before row timestamp (Min: -∞%, Max: +∞%)\n";
  markdown +=
    "- **ROC(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: -∞%, Max: +∞%)\n";
  markdown +=
    "- **EMA(3)**: over previous 3 candles (3 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **EMA(8)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **EMA(13)**: over previous 13 candles (13 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **EMA(21)**: over previous 21 candles (21 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **SMA(8)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **DEMA(8)**: over previous 8 candles (8 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **WMA(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Volume SMA(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0, Max: +∞)\n";
  markdown +=
    "- **Volume Ratio**: volume relative to average at row timestamp (Min: 0x, Max: +∞x)\n";
  markdown +=
    "- **Support**: over previous 30 candles (30 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Resistance**: over previous 30 candles (30 minutes on 1m timeframe) before row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **Current Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)\n";
  markdown +=
    "- **1m Change**: price change percentage over 1 minute at row timestamp (Min: -∞%, Max: +∞%)\n";
  markdown +=
    "- **3m Change**: price change percentage over 3 minutes at row timestamp (Min: -∞%, Max: +∞%)\n";
  markdown +=
    "- **5m Change**: price change percentage over 5 minutes at row timestamp (Min: -∞%, Max: +∞%)\n";
  markdown +=
    "- **Volatility(5)**: over previous 5 candles (5 minutes on 1m timeframe) before row timestamp (Min: 0%, Max: +∞)\n";
  markdown +=
    "- **True Range**: true range value at row timestamp (Min: 0 USD, Max: +∞)\n";
  markdown +=
    "- **Squeeze Momentum**: squeeze momentum indicator at row timestamp (Min: 0, Max: +∞)\n";
  markdown +=
    "- **Pressure Index**: buying/selling pressure percentage at row timestamp (Min: -100%, Max: +100%)\n";
  markdown +=
    "- **Close Price**: close price at row timestamp (Min: 0 USD, Max: +∞ USD)\n";

  return markdown;
}

/**
 * Service for micro-term (1-minute) technical analysis and markdown report generation.
 *
 * Provides comprehensive technical analysis for 1-minute candles with 40+ indicators
 * including momentum (RSI, MACD), trend (EMA, SMA), volatility (ATR, Bollinger Bands),
 * support/resistance levels, volume analysis, and specialized scalping indicators.
 *
 * Key features:
 * - 40+ technical indicators (RSI, MACD, Bollinger Bands, Stochastic, ADX, etc.)
 * - Support/resistance level detection (30-candle lookback)
 * - Volume analysis (SMA, ratio, trend)
 * - Price change tracking (1m, 3m, 5m)
 * - Specialized scalping indicators (squeeze momentum, pressure index, Bollinger position)
 * - Volatility and true range calculations
 * - Markdown table generation for LLM consumption
 * - Intelligent indicator warmup (skips first 21 candles)
 * - Memory-efficient output (last 40 rows only)
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { MicroTermHistoryService } from '@backtest-kit/signals';
 *
 * const service = new MicroTermHistoryService();
 *
 * // Get markdown report for symbol (fetches candles internally)
 * const report = await service.getReport('BTCUSDT');
 * console.log(report); // Markdown table with all indicators
 *
 * // Or analyze custom candles
 * const candles = await getCandles('ETHUSDT', '1m', 60);
 * const rows = await service.getData('ETHUSDT', candles);
 * console.log(rows[0].rsi9); // 45.23
 * console.log(rows[0].squeezeMomentum); // 1.25
 * ```
 */
export class MicroTermHistoryService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Analyzes candle data and returns technical indicator rows.
   *
   * Calculates all technical indicators for provided candles, skips first WARMUP_PERIOD
   * rows to ensure stability, and returns last TABLE_ROWS_LIMIT rows.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param candles - Array of 1-minute candle data
   * @returns Array of technical analysis rows with all indicators
   *
   * @example
   * ```typescript
   * const candles = await getCandles('BTCUSDT', '1m', 60);
   * const rows = await service.getData('BTCUSDT', candles);
   * console.log(rows.length); // Up to 40 rows
   * console.log(rows[0].rsi9); // 45.23
   * console.log(rows[0].volumeRatio); // 1.25
   * ```
   */
  public getData = async (
    symbol: string,
    candles: ICandleData[]
  ): Promise<IMicroTermRow[]> => {
    this.loggerService.log("microTermHistoryService getData", {
      symbol,
      candles: candles.length,
    });
    return generateAnalysis(symbol, candles);
  };

  /**
   * Generates complete markdown technical analysis report for a symbol.
   *
   * Fetches 60 1-minute candles (60 minutes) from exchange, calculates all indicators,
   * and formats results as markdown table optimized for LLM consumption.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @returns Markdown-formatted technical analysis report with table and explanations
   *
   * @example
   * ```typescript
   * const report = await service.getReport('BTCUSDT');
   * console.log(report);
   * // # 1-Minute Candles Trading Analysis for BTCUSDT (Historical Data)
   * // > Current time: 2025-01-14T10:30:00.000Z
   * //
   * // | RSI(9) | MACD(8,21,5) | Squeeze Momentum | ...
   * // | 45.23 | 0.0012 | 1.25 | ...
   * ```
   */
  public getReport = async (symbol: string): Promise<string> => {
    this.loggerService.log("microTermHistoryService getReport", { symbol });
    const candles: ICandleData[] = await getCandles(symbol, "1m", 60);
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
   * const candles = await getCandles('BTCUSDT', '1m', 60);
   * const rows = await service.getData('BTCUSDT', candles);
   * const markdown = await service.generateHistoryTable('BTCUSDT', rows);
   * console.log(markdown); // Markdown table
   * ```
   */
  public generateHistoryTable = async (
    symbol: string,
    rows: IMicroTermRow[]
  ): Promise<string> => {
    this.loggerService.log("microTermHistoryService generateHistoryTable", {
      symbol,
      rowCount: rows.length,
    });
    return generateHistoryTable(rows, symbol);
  };
}

export default MicroTermHistoryService;
