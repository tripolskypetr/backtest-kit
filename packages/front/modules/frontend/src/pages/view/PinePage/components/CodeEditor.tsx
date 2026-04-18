interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
}

export function CodeEditor({ value, onChange, onRun }: CodeEditorProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); onRun(); } }}
      spellCheck={false}
      style={{
        width: 320,
        flexShrink: 0,
        resize: 'none',
        background: '#1e293b',
        color: '#e2e8f0',
        border: 'none',
        borderRight: '1px solid #334155',
        padding: 12,
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 1.5,
        outline: 'none',
      }}
    />
  );
}
