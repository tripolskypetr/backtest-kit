export interface ICandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Сырая OHLCV-свеча биржи: [timestamp, open, high, low, close, volume].
 * Элементы допускают undefined, чтобы подходил любой источник без кастов.
 */
export type TRawOHLCV = (number | undefined)[];

/**
 * Источник сырых свечей. since в миллисекундах; должен вернуть
 * до limit свечей начиная с первой свечи >= since.
 */
export type TFetchOHLCV = (
  symbol: string,
  interval: string,
  since: number,
  limit: number,
) => Promise<TRawOHLCV[]>;

export interface IGetCandlesFilledParams {
  symbol: string;
  interval: string;
  since: Date;
  limit: number;
}

const INTERVAL_UNITS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const getIntervalMs = (interval: string) => {
  const match = interval.match(/^(\d+)([mhd])$/);
  if (!match) {
    throw new Error(`unsupported interval: ${interval}`);
  }
  return Number(match[1]) * INTERVAL_UNITS[match[2]];
};

// Последний известный close ДО момента ts: смотрим только в прошлое, без look ahead
const fetchLastCloseBefore = async (
  fetchOHLCV: TFetchOHLCV,
  symbol: string,
  interval: string,
  stepMs: number,
  ts: number,
) => {
  for (let back = 1; back <= 3; back++) {
    const since = ts - back * 1000 * stepMs;
    const candles = await fetchOHLCV(symbol, interval, since, 1000);
    const prev = candles.filter(([timestamp]) => timestamp! < ts).pop();
    if (prev) {
      return prev[4]!;
    }
  }
  return null;
};

/**
 * Возвращает limit свечей начиная с since непрерывной сеткой интервала.
 * Пропуски источника (даунтайм биржи) заполняются плоской свечой из
 * последнего известного close (volume = 0) - строго без look ahead:
 * для дыры в начале окна последний close ищется в прошлом до окна.
 * Если дыру нечем заполнить (истории до окна нет - символ еще не
 * торговался), бросает исключение: результат всегда ровно limit свечей.
 */
export const getCandlesFilled = async (
  fetchOHLCV: TFetchOHLCV,
  { symbol, interval, since, limit }: IGetCandlesFilledParams,
): Promise<ICandle[]> => {
  const stepMs = getIntervalMs(interval);
  const start = Math.ceil(since.getTime() / stepMs) * stepMs;
  const candles = await fetchOHLCV(symbol, interval, start, limit);
  const byTimestamp = new Map(candles.map((candle) => [candle[0], candle]));
  let lastClose = byTimestamp.has(start)
    ? null
    : await fetchLastCloseBefore(fetchOHLCV, symbol, interval, stepMs, start);
  const result: ICandle[] = [];
  for (let i = 0; i < limit; i++) {
    const ts = start + i * stepMs;
    const candle = byTimestamp.get(ts);
    if (candle) {
      const [timestamp, open, high, low, close, volume] = candle;
      result.push({
        timestamp: timestamp!,
        open: open!,
        high: high!,
        low: low!,
        close: close!,
        volume: volume!,
      });
      lastClose = close!;
    } else if (lastClose !== null) {
      result.push({
        timestamp: ts,
        open: lastClose,
        high: lastClose,
        low: lastClose,
        close: lastClose,
        volume: 0,
      });
    }
  }
  if (result.length !== limit) {
    throw new Error(
      `getCandlesFilled: ожидалось ${limit} свечей, получено ${result.length} ` +
        `(${symbol} ${interval} с ${new Date(start).toISOString()}) - ` +
        `нет данных для заполнения пропуска без look ahead`,
    );
  }
  return result;
};
