import { PineTS } from 'pinets';

export type ISymbolInfo = {
    current_contract: string;
    description: string;
    isin: string;
    main_tickerid: string;
    prefix: string;
    root: string;
    ticker: string;
    tickerid: string;
    type: string;
    basecurrency: string;
    country: string;
    currency: string;
    timezone: string;
    employees: number;
    industry: string;
    sector: string;
    shareholders: number;
    shares_outstanding_float: number;
    shares_outstanding_total: number;
    expiration_date: number;
    session: string;
    volumetype: string;
    mincontract: number;
    minmove: number;
    mintick: number;
    pointvalue: number;
    pricescale: number;
    recommendations_buy: number;
    recommendations_buy_strong: number;
    recommendations_date: number;
    recommendations_hold: number;
    recommendations_sell: number;
    recommendations_sell_strong: number;
    recommendations_total: number;
    target_price_average: number;
    target_price_date: number;
    target_price_estimates: number;
    target_price_high: number;
    target_price_low: number;
    target_price_median: number;
};
export interface IProvider {
    getMarketData(tickerId: string, timeframe: string, limit?: number, sDate?: number, eDate?: number): Promise<any>;
    getSymbolInfo(tickerId: string): Promise<ISymbolInfo>;
}

interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime?: number;
}

// Кастомный провайдер для нескольких символов и таймфреймов
class CustomDataProvider implements IProvider {
  // Ключ: "SYMBOL:TIMEFRAME" -> данные
  private dataStore: Map<string, Candle[]> = new Map();
  
  // Нормализация таймфрейма (PineTS может передавать разные форматы)
  private normalizeTimeframe(tf: string): string {
    const tfMap: Record<string, string> = {
      '1': '1m',
      '3': '3m', 
      '5': '5m',
      '15': '15m',
      '30': '30m',
      '60': '1h',
      '120': '2h',
      '240': '4h',
      '360': '6h',
      '480': '8h',
      '720': '12h',
      'D': '1d',
      '1D': '1d',
      'W': '1w',
      '1W': '1w',
      'M': '1M',
      '1M': '1M',
    };
    return tfMap[tf] || tf.toLowerCase();
  }
  
  // Генерация ключа для хранилища
  private getKey(tickerId: string, timeframe: string): string {
    const symbol = tickerId.toUpperCase().replace(/^BINANCE:|^BYBIT:|^OKX:/, '');
    const tf = this.normalizeTimeframe(timeframe);
    return `${symbol}:${tf}`;
  }
  
  // Добавляем данные для символа и таймфрейма
  addData(tickerId: string, timeframe: string, ohlcv: Candle[]): void {
    const key = this.getKey(tickerId, timeframe);
    this.dataStore.set(key, ohlcv);
  }
  
  // Добавляем данные для символа с несколькими таймфреймами сразу
  addSymbolData(tickerId: string, dataByTimeframe: Record<string, Candle[]>): void {
    for (const [tf, data] of Object.entries(dataByTimeframe)) {
      this.addData(tickerId, tf, data);
    }
  }
  
  // Проверка наличия данных
  hasData(tickerId: string, timeframe: string): boolean {
    return this.dataStore.has(this.getKey(tickerId, timeframe));
  }
  
  // Получить список доступных ключей
  getAvailableData(): string[] {
    return Array.from(this.dataStore.keys());
  }
  
  async getMarketData(
    tickerId: string, 
    timeframe: string, 
    limit?: number, 
    sDate?: number, 
    eDate?: number
  ): Promise<Candle[]> {
    const key = this.getKey(tickerId, timeframe);
    const data = this.dataStore.get(key);
    
    if (!data) {
      const available = this.getAvailableData().join(', ');
      throw new Error(
        `No data for ${key}. Available: [${available}]`
      );
    }
    
    let filtered = [...data];
    
    // Фильтрация по датам
    if (sDate) {
      filtered = filtered.filter(c => c.openTime >= sDate);
    }
    if (eDate) {
      filtered = filtered.filter(c => c.openTime <= eDate);
    }
    
    // Лимит (берём последние N свечей)
    if (limit && filtered.length > limit) {
      filtered = filtered.slice(-limit);
    }
    
    return filtered;
  }
  
  async getSymbolInfo(tickerId: string): Promise<ISymbolInfo> {
    const symbol = tickerId.toUpperCase().replace(/^BINANCE:|^BYBIT:|^OKX:/, '');
    const base = symbol.replace(/USDT$|BUSD$|USD$/, '');
    const quote = symbol.replace(base, '');
    
    return {
      ticker: symbol,
      tickerid: symbol,
      description: `${base}/${quote}`,
      type: 'crypto',
      basecurrency: base,
      currency: quote || 'USDT',
      timezone: 'UTC',
    } as ISymbolInfo;
  }
  
  // Очистка данных
  clear(): void {
    this.dataStore.clear();
  }
}


interface ISignalDto {
  position: "long" | "short" | "wait";
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
}

interface SignalPlots {
  signal: number;      // 1 = long, -1 = short, 0 = wait
  stopLoss: number;
  takeProfit: number;
  estimatedMinutes?: number;
}

class PineTSSignalExtractor {
  
  // Получить последнее значение из plot
  static getLastValue(plots: any, name: string): number {
    const data = plots[name]?.data;
    if (!data || data.length === 0) return 0;
    return data[data.length - 1]?.value ?? 0;
  }
  
  // Получить значение на конкретном баре (0 = последний, 1 = предпоследний)
  static getValue(plots: any, name: string, barsBack: number = 0): number {
    const data = plots[name]?.data;
    if (!data || data.length === 0) return 0;
    const idx = data.length - 1 - barsBack;
    return idx >= 0 ? (data[idx]?.value ?? 0) : 0;
  }
  
  // Получить всю серию как массив чисел
  static getSeries(plots: any, name: string): number[] {
    const data = plots[name]?.data;
    if (!data) return [];
    return data.map((d: any) => d.value ?? 0);
  }
  
  // Извлечь сигнал из стандартизированных plots
  static extractSignal(
    plots: any, 
    currentPrice: number,
    config: {
      signalPlot: string;        // имя plot с сигналом (1/-1/0)
      stopLossPlot: string;      // имя plot со стоп-лоссом
      takeProfitPlot: string;    // имя plot с тейк-профитом
      estimatedMinutes?: number; // время удержания
    }
  ): ISignalDto {
    const signal = this.getLastValue(plots, config.signalPlot);
    const sl = this.getLastValue(plots, config.stopLossPlot);
    const tp = this.getLastValue(plots, config.takeProfitPlot);
    
    if (signal === 1) {
      return {
        position: 'long',
        priceOpen: currentPrice,
        priceTakeProfit: tp,
        priceStopLoss: sl,
        minuteEstimatedTime: config.estimatedMinutes ?? 0,
      };
    }
    
    if (signal === -1) {
      return {
        position: 'short',
        priceOpen: currentPrice,
        priceTakeProfit: tp,
        priceStopLoss: sl,
        minuteEstimatedTime: config.estimatedMinutes ?? 0,
      };
    }
    
    return {
      position: 'wait',
      priceOpen: 0,
      priceTakeProfit: 0,
      priceStopLoss: 0,
      minuteEstimatedTime: 0,
    };
  }
}


// Твои OHLCV данные
const btc1h: Candle[] = [
  { openTime: 1704067200000, open: 42000, high: 42500, low: 41800, close: 42300, volume: 1000 },
  { openTime: 1704070800000, open: 42300, high: 42800, low: 42100, close: 42600, volume: 1200 },
  // ...
];

const btc4h: Candle[] = [
  { openTime: 1704067200000, open: 42000, high: 43000, low: 41500, close: 42800, volume: 5000 },
  // ...
];

const eth1h: Candle[] = [
  { openTime: 1704067200000, open: 2200, high: 2250, low: 2180, close: 2230, volume: 500 },
  { openTime: 1704070800000, open: 2230, high: 2280, low: 2210, close: 2260, volume: 600 },
  // ...
];

const eth4h: Candle[] = [
  { openTime: 1704067200000, open: 2200, high: 2300, low: 2150, close: 2280, volume: 2500 },
  // ...
];

// Создаём провайдер и загружаем данные
const provider = new CustomDataProvider();

// Вариант 1: по одному
provider.addData('BTCUSDT', '1h', btc1h);
provider.addData('BTCUSDT', '4h', btc4h);
provider.addData('ETHUSDT', '1h', eth1h);
provider.addData('ETHUSDT', '4h', eth4h);

const pineTS = new PineTS(provider, 'BTCUSDT', '1h', 100);

const pineScriptCode = `
//@version=5
indicator("Signal Generator")

// Индикаторы
rsi = ta.rsi(close, 14)
ema_fast = ta.ema(close, 9)
ema_slow = ta.ema(close, 21)
atr = ta.atr(14)

// Условия входа
long_condition = ta.crossover(ema_fast, ema_slow) and rsi < 70
short_condition = ta.crossunder(ema_fast, ema_slow) and rsi > 30

// Расчёт уровней
stop_loss_long = close - atr * 2
take_profit_long = close + atr * 3
stop_loss_short = close + atr * 2
take_profit_short = close - atr * 3

// Возвращаем данные для сигнала
plot(rsi, "RSI")
plot(long_condition ? 1 : short_condition ? -1 : 0, "Signal")
plot(stop_loss_long, "SL_Long")
plot(take_profit_long, "TP_Long")
plot(stop_loss_short, "SL_Short")
plot(take_profit_short, "TP_Short")
`

// Использование
const { plots } = await pineTS.run(pineScriptCode);

const lastClose = PineTSSignalExtractor.getLastValue(plots, 'Close');

const signal = PineTSSignalExtractor.extractSignal(plots, lastClose, {
  signalPlot: 'Signal',
  stopLossPlot: 'StopLoss',
  takeProfitPlot: 'TakeProfit',
  estimatedMinutes: 240,
});
