import { useRef } from 'react';
import { Toolbar } from '../components/Toolbar';
import { CodeEditor } from '../components/CodeEditor';
import { useIndicatorStream } from '../hooks/useIndicatorStream';
import { Styles } from '../components/Styles';
import { PortalView } from 'react-declarative';
import { useCodeState } from '../context/CodeContext';
import { useSymbolState } from '../context/SymbolContext';
import { useTimeframeState } from '../context/TimeframeContext';
import { useFromDateState } from '../context/FromDateContext';
import { useToDateState } from '../context/ToDateContext';
import { useLimitState } from '../context/LimitContext';

export const MainView = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const [code, setCode] = useCodeState();
  const [symbol, setSymbol] = useSymbolState();
  const [timeframe, setTimeframe] = useTimeframeState();
  const [fromDate, setFromDate] = useFromDateState();
  const [toDate, setToDate] = useToDateState();
  const [limit, setLimit] = useLimitState();

  const { run, status, running } = useIndicatorStream();

  function handleRun() {
    run({ symbol, timeframe, fromDate, toDate, limit, code, containerRef: chartContainerRef });
  }

  return (
    <PortalView>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: 'monospace' }}>
        <Toolbar
          symbol={symbol} timeframe={timeframe}
          fromDate={fromDate} toDate={toDate}
          limit={limit} running={running} status={status}
          onSymbolChange={setSymbol} onTimeframeChange={setTimeframe}
          onFromDateChange={setFromDate} onToDateChange={setToDate}
          onLimitChange={setLimit} onRun={handleRun}
        />
        <div style={{ display: 'flex', flex: 1, overflow: 'clip' }}>
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
    </PortalView>
  );
}

export default MainView;
