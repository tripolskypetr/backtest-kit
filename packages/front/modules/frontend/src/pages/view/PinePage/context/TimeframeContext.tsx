import { createLsStateProvider } from "react-declarative";

const DEFAULT_TIMEFRAME = "1";

const [Provider, useTimeframeState] = createLsStateProvider<string>('pine-timeframe-context');

const TimeframeProvider = (props: React.PropsWithChildren) => (
    <Provider initialState={DEFAULT_TIMEFRAME}>
        {props.children}
    </Provider>
)

export { TimeframeProvider, useTimeframeState }
