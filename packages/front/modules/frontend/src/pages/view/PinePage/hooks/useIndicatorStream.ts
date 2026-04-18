import { useEffect, useRef, useState } from 'react';

function toOHLCV(k: PineTSContext['marketData'][number]): OHLCV {
  return { time: k.openTime, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume };
}

interface StreamOptions {
  symbol: string;
  timeframe: string;
  fromDate: string;
  toDate: string;
  code: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
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

  function run({ symbol, timeframe, fromDate, toDate, code, containerRef }: StreamOptions) {
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
      const pineTS = new PineTS(PineTS.Provider.Binance, symbol, timeframe, 1000, sDate, eDate);
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
