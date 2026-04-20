import { createLsStateProvider } from "react-declarative";

const DEFAULT_CODE = `//@version=5
indicator("Simple MA", overlay=true)

length = input.int(20, "Length")
sma = ta.sma(close, length)

plot(sma, "SMA", color.blue, linewidth=2)`;

const [Provider, useCodeState] = createLsStateProvider<string>('pine-code-context');

const CodeProvider = (props: React.PropsWithChildren) => (
    <Provider initialState={DEFAULT_CODE}>
        {props.children}
    </Provider>
)

export { CodeProvider, useCodeState }
