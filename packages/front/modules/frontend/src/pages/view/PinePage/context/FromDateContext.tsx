import { createLsStateProvider } from "react-declarative";

const DEFAULT_FROM_DATE = "";

const [Provider, useFromDateState] = createLsStateProvider<string>('pine-from-date-context');

const FromDateProvider = (props: React.PropsWithChildren) => (
    <Provider initialState={DEFAULT_FROM_DATE}>
        {props.children}
    </Provider>
)

export { FromDateProvider, useFromDateState }
