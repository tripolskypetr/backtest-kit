import { join } from "path";
import { opendir, readFile, stat } from "fs/promises";
import backtest from "../lib";
import { ExchangeInstance } from "../classes/Exchange";
import { GLOBAL_CONFIG } from "../config/params";
import { ExchangeName, CandleInterval } from "../interfaces/Exchange.interface";

const WARM_CANDLES_METHOD_NAME = "cache.warmCandles";
const CHECK_CANDLES_METHOD_NAME = "cache.checkCandles";

const MS_PER_MINUTE = 60_000;

const INTERVAL_MINUTES: Record<CandleInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "1d": 1440,
};

const ALIGN_TO_INTERVAL_FN = (
  timestamp: number,
  intervalMinutes: number,
): number => {
  const intervalMs = intervalMinutes * MS_PER_MINUTE;
  return Math.floor(timestamp / intervalMs) * intervalMs;
};

const BAR_LENGTH = 30;
const BAR_FILLED_CHAR = "\u2588";
const BAR_EMPTY_CHAR = "\u2591";

const PRINT_PROGRESS_FN = (
  fetched: number,
  total: number,
  symbol: string,
  interval: CandleInterval,
) => {
  const percent = Math.round((fetched / total) * 100);
  const filled = Math.round((fetched / total) * BAR_LENGTH);
  const empty = BAR_LENGTH - filled;
  const bar = BAR_FILLED_CHAR.repeat(filled) + BAR_EMPTY_CHAR.repeat(empty);
  process.stdout.write(
    `\r[${bar}] ${percent}% (${fetched}/${total}) ${symbol} ${interval}`,
  );
  if (fetched === total) {
    process.stdout.write("\n");
  }
};

/**
 * Parameters for pre-caching candles into persist storage.
 * Used to download historical candle data before running a backtest.
 */
export interface ICacheCandlesParams {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Name of the registered exchange schema */
  exchangeName: ExchangeName;
  /** Candle time interval (e.g., "1m", "4h") */
  interval: CandleInterval;
  /** Start date of the caching range (inclusive) */
  from: Date;
  /** End date of the caching range (inclusive) */
  to: Date;
}

/**
 * Parameters for validating cached candle timestamps.
 * Reads JSON files directly from persist storage directory.
 */
export interface ICheckCandlesParams {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Name of the registered exchange schema */
  exchangeName: ExchangeName;
  /** Candle time interval (e.g., "1m", "4h") */
  interval: CandleInterval;
  /** Start date of the validation range (inclusive) */
  from: Date;
  /** End date of the validation range (inclusive) */
  to: Date;
  /** Base directory of candle persist storage (default: "./dump/data/candle") */
  baseDir?: string;
}

/**
 * Checks cached candle timestamps for correct interval alignment.
 * Reads JSON files directly from persist storage without using abstractions.
 *
 * @param params - Validation parameters
 */
export async function checkCandles(params: ICheckCandlesParams): Promise<void> {
  const { symbol, exchangeName, interval, from, to, baseDir = "./dump/data/candle" } = params;

  backtest.loggerService.info(CHECK_CANDLES_METHOD_NAME, params);

  const step = INTERVAL_MINUTES[interval];

  if (!step) {
    throw new Error(
      `checkCandles: unsupported interval=${interval}`,
    );
  }

  const stepMs = step * MS_PER_MINUTE;
  const dir = join(baseDir, exchangeName, symbol, interval);

  const fromTs = ALIGN_TO_INTERVAL_FN(from.getTime(), step);
  const toTs = ALIGN_TO_INTERVAL_FN(to.getTime(), step);

  try {
    await stat(dir);
  } catch {
    throw new Error(
      `checkCandles: cache directory not found: ${dir}`,
    );
  }

  // Collect only filenames (strings) in range via async iterator — no full readdir in memory
  const files: string[] = [];
  for await (const entry of await opendir(dir)) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const ts = Number(entry.name.replace(".json", ""));
    if (ts >= fromTs && ts < toTs) {
      files.push(entry.name);
    }
  }

  if (files.length === 0) {
    throw new Error(
      `checkCandles: no cached candles in range [${fromTs}, ${toTs}) in ${dir}`,
    );
  }

  files.sort();

  let prevTimestamp: number | null = null;
  let prevName: string | null = null;

  PRINT_PROGRESS_FN(0, files.length, symbol, interval);

  for (let i = 0; i < files.length; i++) {
    const filePath = join(dir, files[i]);
    const raw = await readFile(filePath, "utf-8");
    let candle: any;
    try {
      candle = JSON.parse(raw);
    } catch {
      throw new Error(
        `checkCandles: ${files[i]} contains invalid JSON`,
      );
    }
    const { timestamp } = candle;
    const aligned = ALIGN_TO_INTERVAL_FN(timestamp, step);

    if (timestamp !== aligned) {
      throw new Error(
        `checkCandles: ${files[i]} timestamp not aligned to ${interval} boundary (actual=${timestamp}, expected=${aligned})`,
      );
    }

    if (prevTimestamp !== null) {
      const gap = timestamp - prevTimestamp;

      if (gap !== stepMs) {
        throw new Error(
          `checkCandles: gap between ${prevName} and ${files[i]} (actual=${gap}ms, expected=${stepMs}ms)`,
        );
      }
    }

    prevTimestamp = timestamp;
    prevName = files[i];
    PRINT_PROGRESS_FN(i + 1, files.length, symbol, interval);
  }

  console.log(
    `checkCandles: OK ${files.length} candles ${symbol} ${interval}`,
  );
}

/**
 * Pre-caches candles for a date range into persist storage.
 * Downloads all candles matching the interval from `from` to `to`.
 *
 * @param params - Cache parameters
 */
export async function warmCandles(params: ICacheCandlesParams): Promise<void> {
  const { symbol, exchangeName, interval, from, to } = params;

  backtest.loggerService.info(WARM_CANDLES_METHOD_NAME, {
    symbol,
    exchangeName,
    interval,
    from,
    to,
  });

  const step = INTERVAL_MINUTES[interval];

  if (!step) {
    throw new Error(
      `warmCandles: unsupported interval=${interval}`,
    );
  }

  const stepMs = step * MS_PER_MINUTE;
  const instance = new ExchangeInstance(exchangeName);

  const sinceTimestamp = ALIGN_TO_INTERVAL_FN(from.getTime(), step);
  const untilTimestamp = ALIGN_TO_INTERVAL_FN(to.getTime(), step);
  const totalCandles = Math.ceil((untilTimestamp - sinceTimestamp) / stepMs);

  if (totalCandles <= 0) {
    throw new Error(
      `warmCandles: no candles to cache (from >= to after alignment)`,
    );
  }

  let fetched = 0;
  let currentSince = sinceTimestamp;

  PRINT_PROGRESS_FN(fetched, totalCandles, symbol, interval);

  while (fetched < totalCandles) {
    const chunkLimit = Math.min(
      totalCandles - fetched,
      GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST,
    );
    await instance.getRawCandles(symbol, interval, chunkLimit, currentSince);
    fetched += chunkLimit;
    currentSince += chunkLimit * stepMs;
    PRINT_PROGRESS_FN(fetched, totalCandles, symbol, interval);
  }
}
