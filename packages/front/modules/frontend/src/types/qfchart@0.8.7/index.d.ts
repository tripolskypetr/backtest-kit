// Browser globals injected via <script> tags in index.html

interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface QFChartInstance {
  setMarketData(data: OHLCV[]): void;
  updateData(data: OHLCV[]): void;
  addIndicator(id: string, plots: unknown, options?: unknown): { updateData(plots: unknown): void };
  registerPlugin(plugin: unknown): void;
  destroy(): void;
  resize(): void;
}

interface QFChartConstructor {
  new (container: HTMLElement, options?: unknown): QFChartInstance;
}

interface QFChartNamespace {
  QFChart: QFChartConstructor;
  MeasureTool: new () => unknown;
  LineTool: new () => unknown;
  FibonacciTool: new () => unknown;
}

interface PineTSStream {
  on(event: 'data', handler: (ctx: PineTSContext) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
  stop(): void;
}

interface PineTSContext {
  marketData: Array<{
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  plots: unknown;
  fullContext?: { plots: unknown };
}

interface PineTSConstructor {
  new (provider: unknown, symbol: string, timeframe: string, length: number, sDate?: number, eDate?: number): {
    stream(code: string, options?: { pageSize?: number; live?: boolean; interval?: number }): PineTSStream;
  };
  Provider: { Binance: unknown };
}

declare const QFChart: QFChartNamespace;
declare const PineTS: PineTSConstructor;
