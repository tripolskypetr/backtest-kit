import { useEffect, useRef, useState } from 'react';
import ioc from '../../../../lib';

const PINE_TF_MAP = {
  "1": "1m",
  "3": "3m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "120": "2h",
  "240": "4h",
  "360": "6h",
  "480": "8h",
  "1D": "1d",
  D: "1d",
};

function toOHLCV(k: PineTSContext['marketData'][number]): OHLCV {
  return { time: k.openTime, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume };
}

interface StreamOptions {
  symbol: string;
  timeframe: string;
  fromDate: string;
  toDate: string;
  limit: number;
  code: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

class CandleProvider {
  async getMarketData(
    tickerId: string,
    timeframe: string,
    limit?: number,
    sDate?: number,
    eDate?: number,
  ): Promise<any[]> {
    const symbol = tickerId
      .toUpperCase()
      .replace(/^BINANCE:|^BYBIT:|^OKX:/, "");

    const normalizedTimeframe = PINE_TF_MAP[timeframe] ?? timeframe;

    const rawCandles = await ioc.exchangeViewService.getRangeCandles({
      symbol,
      interval: normalizedTimeframe,
      limit,
      sDate,
      eDate,
    });

    const candles = rawCandles.map((c) => ({
      openTime: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    return candles;
  }

  async getSymbolInfo(tickerId: string): Promise<any> {

    const symbol = tickerId
      .toUpperCase()
      .replace(/^BINANCE:|^BYBIT:|^OKX:/, "");
    const base = symbol.replace(/USDT$|BUSD$|USD$/, "");
    const quote = symbol.replace(base, "");

    const result = {
      ticker: symbol,
      tickerid: symbol,
      description: `${base}/${quote}`,
      type: "crypto",
      basecurrency: base,
      currency: quote || "USDT",
      timezone: "UTC",
    };

    return result;
  }
}


export function useIndicatorStream() {
  const chartRef = useRef<QFChartInstance | null>(null);
  const indicatorRef = useRef<ReturnType<QFChartInstance['addIndicator']> | null>(null);
  const streamRef = useRef<PineTSStream | null>(null);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const onResize = () => chartRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      stopStream();
      destroyChart();
    };
  }, []);

  function stopStream() {
    if (streamRef.current) {
      try { streamRef.current.stop(); } catch { /* ignore */ }
      streamRef.current = null;
    }
  }

  function destroyChart() {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
      indicatorRef.current = null;
    }
  }

  function handleError(err: unknown) {
    setStatus(`Error: ${(err as Error).message}`);
    setRunning(false);
  }

  function run({ symbol, timeframe, fromDate, toDate, limit, code, containerRef }: StreamOptions) {
    if (!containerRef.current) return;

    setRunning(true);
    setStatus('Connecting...');
    stopStream();
    destroyChart();

    const isOverlay = /indicator\([^)]*overlay\s*=\s*true/i.test(code);
    let initialized = false;

    try {
      const sDate = fromDate ? new Date(fromDate).getTime() : undefined;
      const eDate = toDate ? new Date(toDate).getTime() : undefined;
      const provider = new CandleProvider();
      const pineTS = new PineTS(provider, symbol, timeframe, limit, sDate, eDate);
      const stream = pineTS.stream(code, { pageSize: 500, live: true, interval: 3000 });
      streamRef.current = stream;

      stream.on('data', (ctx: PineTSContext) => {
        if (streamRef.current !== stream) return;

        if (!initialized) {
          initialized = true;
          const ohlcv = ctx.marketData.map(toOHLCV);

          containerRef.current!.innerHTML = '';

          chartRef.current = new QFChart.QFChart(containerRef.current!, {
            title: `${symbol} · ${timeframe}`,
            backgroundColor: '#0f172a',
            height: '100%',
            padding: 0.1,
            databox: { position: 'right', triggerOn: 'mousemove' },
            dataZoom: { visible: true, position: 'top', height: 6, start: 80, end: 101 },
            layout: { mainPaneHeight: '70%', gap: 5 },
            controls: { collapse: false, maximize: false, fullscreen: false },
          });

          chartRef.current.setMarketData(ohlcv);

          const plots = ctx.fullContext?.plots ?? ctx.plots;
          indicatorRef.current = chartRef.current.addIndicator('indicator', plots, {
            overlay: isOverlay,
            height: isOverlay ? undefined : 30,
            controls: { collapse: false, maximize: false },
          });

          chartRef.current.registerPlugin(new QFChart.MeasureTool());
          chartRef.current.registerPlugin(new QFChart.LineTool());
          chartRef.current.registerPlugin(new QFChart.FibonacciTool());

          setStatus(`${ohlcv.length} bars loaded`);
          setRunning(false);
        } else {
          if (indicatorRef.current && ctx.plots) {
            indicatorRef.current.updateData(ctx.plots);
          }
          chartRef.current?.updateData([toOHLCV(ctx.marketData[ctx.marketData.length - 1])]);
        }
      });

      stream.on('error', handleError);
    } catch (err) {
      handleError(err);
    }
  }

  return { run, status, running };
}
