import { sleep } from "functools-kit";

const INTERVAL_MINUTES = {
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
};

export const getMockCandles = async (interval, since, limit) => {

  // await sleep(50);

  const candles = [];
  const intervalMs = INTERVAL_MINUTES[interval] * 60000;

  // Generate candles from since forward
  for (let i = 0; i < limit; i++) {
    const timestamp = since.getTime() + i * intervalMs;
    const basePrice = 42000 + i * 100;

    candles.push({
      timestamp,
      open: basePrice + 150.5,
      high: basePrice + 380.2,
      low: basePrice + 100.0,
      close: basePrice + 250.8,
      volume: 100 + i * 10,
    });
  }

  return candles;
};

export default getMockCandles;
