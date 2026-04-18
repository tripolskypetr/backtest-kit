import { useRef, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { CodeEditor } from './components/CodeEditor';
import { useIndicatorStream } from './hooks/useIndicatorStream';
import { Styles } from './components/Styles';

const DEFAULT_CODE = `//@version=5
indicator("Simple MA", overlay=true)

length = input.int(20, "Length")
sma = ta.sma(close, length)

plot(sma, "SMA", color.blue, linewidth=2)`;

export const PinePage = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [symbol, setSymbol] = useState('BTCUSDC');
  const [timeframe, setTimeframe] = useState('D');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { run, status, running } = useIndicatorStream();

  function handleRun() {
    run({ symbol, timeframe, fromDate, toDate, code, containerRef: chartContainerRef });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'monospace' }}>
      <Toolbar
        symbol={symbol} timeframe={timeframe}
        fromDate={fromDate} toDate={toDate}
        running={running} status={status}
        onSymbolChange={setSymbol} onTimeframeChange={setTimeframe}
        onFromDateChange={setFromDate} onToDateChange={setToDate}
        onRun={handleRun}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <CodeEditor value={code} onChange={setCode} onRun={handleRun} />
        <div style={{ flex: 1 }}>
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }}>
            <p style={{ color: '#475569', textAlign: 'center', marginTop: '20%' }}>
              Press <b>▶ Run</b> or <b>Ctrl+Enter</b> to load the chart
            </p>
          </div>
        </div>
      </div>
      <Styles />
    </div>
  );
}

export default PinePage;
