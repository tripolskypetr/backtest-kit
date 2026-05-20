import { join } from "path";
import { opendir, readFile, stat } from "fs/promises";
import backtest from "../lib";
import { ExchangeInstance } from "../classes/Exchange";
import { GLOBAL_CONFIG } from "../config/params";
import { ExchangeName, CandleInterval } from "../interfaces/Exchange.interface";
import { PersistCandleAdapter } from "../classes/Persist";
import { retry } from "functools-kit";

const WARM_CANDLES_METHOD_NAME = "cache.warmCandles";
const CHECK_CANDLES_METHOD_NAME = "cache.checkCandles";
const CACHE_CANDLES_METHOD_NAME = "cache.cacheCandles";

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
export interface IWarmCandlesParams {
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
 * Parameters for validating cached candle presence.
 * Queries persist storage adapter without scanning files.
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
}

/**
 * Parameters for the combined check-then-warm caching flow.
 * Extends both validation and pre-cache parameter sets and adds
 * lifecycle callbacks invoked before each phase of the flow.
 */
export interface ICacheCandlesParams extends IWarmCandlesParams, ICheckCandlesParams {
  /** Invoked before the cache validation phase starts */
  onWarmStart: (symbol: string, interval: CandleInterval, from: Date, to: Date) => void;
  /** Invoked before the cache warm-up phase starts (after a validation miss) */
  onCheckStart: (symbol: string, interval: CandleInterval, from: Date, to: Date) => void;
}

/**
 * Retry-wrapped pipeline: validates the cache via `checkCandles` and, on miss,
 * fills it via `warmCandles` and rethrows to trigger a retry pass that
 * re-validates the freshly cached range. Limited to 2 attempts.
 */
const CACHE_CANDLES_FN = retry(
  async (
    interval: CandleInterval,
    dto: {
      symbol: string;
      exchangeName: string;
      from: Date;
      to: Date;
    },
    onWarmStart: (symbol: string, interval: CandleInterval, from: Date, to: Date) => void,
    onCheckStart: (symbol: string, interval: CandleInterval, from: Date, to: Date) => void,
  ) => {
    try {
      onWarmStart && onWarmStart(dto.symbol, interval, dto.from, dto.to);
      await checkCandles({
        exchangeName: dto.exchangeName,
        from: dto.from,
        to: dto.to,
        symbol: dto.symbol,
        interval: <CandleInterval>interval,
      });
    } catch (error) {
      onCheckStart && onCheckStart(dto.symbol, interval, dto.from, dto.to);
      await warmCandles({
        symbol: dto.symbol,
        exchangeName: dto.exchangeName,
        from: dto.from,
        to: dto.to,
        interval: <CandleInterval>interval,
      });
      throw error;
    }
  },
  2,
);

/**
 * Checks cached candle timestamps for correct interval alignment.
 * Reads JSON files directly from persist storage without using abstractions.
 *
 * @param params - Validation parameters
 * @param baseDir - Base directory of candle persist storage (default: "./dump/data/candle")
 */
export async function _checkFsCandles(
  params: ICheckCandlesParams, 
  baseDir = join(process.cwd(), "/dump/data/candle")
): Promise<void> {
  const { symbol, exchangeName, interval, from, to } = params;

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
 * Checks cached candle presence via the persist adapter.
 * Issues one ranged read; adapter-side `hasValue` covers each expected timestamp,
 * so a single missing or unaligned candle yields a miss without loading the whole dataset.
 *
 * @param params - Validation parameters
 */
export async function checkCandles(params: ICheckCandlesParams): Promise<void> {
  const { symbol, exchangeName, interval, from, to } = params;

  backtest.loggerService.info(CHECK_CANDLES_METHOD_NAME, params);

  const step = INTERVAL_MINUTES[interval];

  if (!step) {
    throw new Error(
      `checkCandles: unsupported interval=${interval}`,
    );
  }

  const stepMs = step * MS_PER_MINUTE;

  const fromTs = ALIGN_TO_INTERVAL_FN(from.getTime(), step);
  const toTs = ALIGN_TO_INTERVAL_FN(to.getTime(), step);
  const totalCandles = Math.floor((toTs - fromTs) / stepMs);

  if (totalCandles <= 0) {
    throw new Error(
      `checkCandles: empty range [${fromTs}, ${toTs}) for ${symbol} ${interval}`,
    );
  }

  let checked = 0;
  let currentSince = fromTs;

  PRINT_PROGRESS_FN(checked, totalCandles, symbol, interval);

  while (checked < totalCandles) {
    const chunkLimit = Math.min(
      totalCandles - checked,
      GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST,
    );
    const chunkUntil = currentSince + chunkLimit * stepMs;
    const candles = await PersistCandleAdapter.readCandlesData(
      symbol,
      interval,
      exchangeName,
      chunkLimit,
      currentSince,
      chunkUntil,
    );
    if (!candles) {
      throw new Error(
        `checkCandles: cache miss for ${symbol} ${interval} [${currentSince}, ${chunkUntil})`,
      );
    }
    checked += chunkLimit;
    currentSince = chunkUntil;
    PRINT_PROGRESS_FN(checked, totalCandles, symbol, interval);
  }

  console.log(
    `checkCandles: OK ${totalCandles} candles ${symbol} ${interval}`,
  );
}

/**
 * Pre-caches candles for a date range into persist storage.
 * Downloads all candles matching the interval from `from` to `to`.
 *
 * @param params - Cache parameters
 */
export async function warmCandles(params: IWarmCandlesParams): Promise<void> {
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

/**
 * Ensures candles for the given range are present in persist storage.
 * Runs a check-then-warm pipeline with one retry: validates the cache first
 * and, on a miss, downloads the missing data and re-validates.
 *
 * @param params - Combined cache parameters with optional lifecycle callbacks
 */
export async function cacheCandles(
  {
    symbol,
    interval,
    from,
    to,
    exchangeName,
    onCheckStart = (symbol: string, interval: CandleInterval, from: Date, to: Date) => {
      process.stdout.write("\n");
      process.stdout.write(
        `Checking candles cache for ${symbol} ${interval} from ${from} to ${to}\n`,
      );
    },
    onWarmStart = (symbol: string, interval: CandleInterval, from: Date, to: Date) => {
      process.stdout.write("\n\n");
      process.stdout.write(
        `Caching candles for ${symbol} ${interval} from ${from} to ${to}\n`,
      );
    },
  }: ICacheCandlesParams
) {
  backtest.loggerService.info(CACHE_CANDLES_METHOD_NAME, {
    symbol,
    exchangeName,
    interval,
    from,
    to,
  });

  await CACHE_CANDLES_FN(
    interval, 
    {
      exchangeName,
      from,
      to,
      symbol,
    }, 
    onWarmStart,
    onCheckStart,
  );
}
