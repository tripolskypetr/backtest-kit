import { createLsStateProvider } from "react-declarative";

const DEFAULT_TO_DATE = "";

const [Provider, useToDateState] = createLsStateProvider<string>('pine-to-date-context');

const ToDateProvider = (props: React.PropsWithChildren) => (
    <Provider initialState={DEFAULT_TO_DATE}>
        {props.children}
    </Provider>
)

export { ToDateProvider, useToDateState }
