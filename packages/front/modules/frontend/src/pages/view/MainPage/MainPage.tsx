import {
    IOutlet,
    ITabsStep,
    TabsView,
    History,
    useOnce,
} from "react-declarative";
import Navigation from "./components/Navigation";
import ListView from "./view/ListView";
import { createMemoryHistory } from "history";
import { Background } from "../../../components/common/Background";
import ioc from "../../../lib";
import { Container } from "@mui/material";

const history = createMemoryHistory();

const hasMatch = (templates: string[], pathname: string) => {
    return templates.some((template) => template.includes(pathname));
};

const routes: IOutlet[] = [
    {
        id: "backtest",
        element: ListView,
        isActive: (pathname) => hasMatch(["/backtest"], pathname),
    },
    {
        id: "live",
        element: ListView,
        isActive: (pathname) => hasMatch(["/live"], pathname),
    },
];

const tabs: ITabsStep[] = [
    {
        id: "backtest",
        label: "Backtest",
    },
    {
        id: "live",
        label: "Live",
    },
];

interface IMainPageProps {
    symbol: string
}

export const MainPage = ({
    symbol,
}: IMainPageProps) => {

    useOnce(() => history.replace("/backtest"));

    const handleTabChange = (id: string, history: History) => {
        if (id === "backtest") {
            history.replace(`/backtest`);
        }
        if (id === "live") {
            history.replace(`/live`);
        }
    };

    return (
        <Container>
            <TabsView
                withScroll
                sx={{
                    height: "calc(100vh - 105px)",
                }}
                BeforePaper={Navigation}
                onLoadStart={() => ioc.layoutService.setAppbarLoader(true)}
                onLoadEnd={() => ioc.layoutService.setAppbarLoader(false)}
                routes={routes}
                tabs={tabs}
                history={history}
                initialData={() => ({
                    backtest: {
                        type: "backtest"
                    },
                    live: {
                        type: "live"
                    },
                })}
                payload={() => ({
                    symbol,
                })}
                onTabChange={handleTabChange}
            />
            <Background />
        </Container>
    );
};

export default MainPage;
