import { createLsStateProvider } from "react-declarative";

const DEFAULT_SYMBOL = "BTCUSDT";

const [Provider, useSymbolState] = createLsStateProvider<string>('pine-symbol-context');

const SymbolProvider = (props: React.PropsWithChildren) => (
    <Provider initialState={DEFAULT_SYMBOL}>
        {props.children}
    </Provider>
)

export { SymbolProvider, useSymbolState }
