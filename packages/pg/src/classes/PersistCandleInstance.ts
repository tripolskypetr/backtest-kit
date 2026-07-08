import { CandleData, CandleInterval, IPersistCandleInstance, intervalStepMs } from "backtest-kit";
import ioc from "../lib";
import { waitForInit } from "../utils/waitForInit";

export class PersistCandleInstance implements IPersistCandleInstance {
  constructor(
    readonly symbol: string,
    readonly interval: CandleInterval,
    readonly exchangeName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInit();
  }
  async writeCandlesData(candles: CandleData[]): Promise<void> {
    for (const candle of candles) {
      await ioc.candleDbService.create({
        symbol: this.symbol,
        interval: this.interval,
        exchangeName: this.exchangeName,
        close: candle.close,
        high: candle.high,
        low: candle.low,
        open: candle.open,
        timestamp: candle.timestamp,
        volume: candle.volume,
      });
    }
  }
  async readCandlesData(limit: number, sinceTimestamp: number) {
    const stepMs = intervalStepMs(this.interval);
    const result: CandleData[] = [];
    for (let i = 0; i < limit; i++) {
      const ts = sinceTimestamp + i * stepMs;
      const row = await ioc.candleDbService.findBySymbolIntervalTimestamp(this.symbol, this.interval, this.exchangeName, ts);
      if (!row) {
        return null;
      }
      result.push({ timestamp: row.timestamp, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume });
    }
    return result;
  }
}

export default PersistCandleInstance;
