const TIMEFRAMES = ['1', '5', '15', '60', 'D'] as const;

interface ToolbarProps {
  symbol: string;
  timeframe: string;
  fromDate: string;
  toDate: string;
  limit: number;
  running: boolean;
  status: string;
  onSymbolChange: (v: string) => void;
  onTimeframeChange: (v: string) => void;
  onFromDateChange: (v: string) => void;
  onToDateChange: (v: string) => void;
  onLimitChange: (v: number) => void;
  onRun: () => void;
}

const selectStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 13,
};

const dateStyle: React.CSSProperties = {
  ...selectStyle,
  colorScheme: 'dark',
};

export function Toolbar({
  symbol, timeframe, fromDate, toDate, limit, running, status,
  onSymbolChange, onTimeframeChange, onFromDateChange, onToDateChange, onLimitChange, onRun,
}: ToolbarProps) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: '#1e293b', alignItems: 'center', flexShrink: 0 }}>
      <input type="text" value={symbol} onChange={(e) => onSymbolChange(e.target.value.toUpperCase())} style={{ ...selectStyle, width: 100 }} placeholder="BTCUSDT" />
      <select value={timeframe} onChange={(e) => onTimeframeChange(e.target.value)} style={selectStyle}>
        {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
      </select>
      <input type="number" value={limit} min={100} step={100} onChange={(e) => onLimitChange(Number(e.target.value))} style={{ ...selectStyle, width: 80 }} title="Bars limit" />
      <input type="date" value={fromDate} onChange={(e) => onFromDateChange(e.target.value)} style={dateStyle} title="From date" />
      <input type="date" value={toDate} onChange={(e) => onToDateChange(e.target.value)} style={dateStyle} title="To date" />
      <button onClick={onRun} disabled={running} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 16px', fontSize: 13, cursor: 'pointer' }}>
        {running ? '...' : '▶ Run'}
      </button>
      {status && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{status}</span>}
    </div>
  );
}
