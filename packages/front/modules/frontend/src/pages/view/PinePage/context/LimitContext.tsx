import { createLsStateProvider } from "react-declarative";

const DEFAULT_LIMIT = 250;

const [Provider, useLimitState] = createLsStateProvider<number>('pine-limit-context');

const LimitProvider = (props: React.PropsWithChildren) => (
    <Provider initialState={DEFAULT_LIMIT}>
        {props.children}
    </Provider>
)

export { LimitProvider, useLimitState }
