import { IOutlet, IOutletProps, OutletView } from "react-declarative";
import hasRouteMatch from "../../../utils/hasRouteMatch";

import MainView from "./view/MainView";
import ChartView from "./view/ChartView";
import ioc from "../../../lib";

const routes: IOutlet[] = [
    {
        id: "symbol",
        element: ChartView,
        isActive: (pathname) => hasRouteMatch(["/price_chart/:symbol"], pathname),
    },
    {
        id: "main",
        element: MainView,
        isActive: (pathname) => hasRouteMatch(["/price_chart"], pathname),
    },
];

interface IPriceChartPageProps {
    symbol: string;
}

export const PriceChartPage = ({ symbol }: IPriceChartPageProps) => (
    <OutletView
        history={ioc.routerService}
        onLoadStart={() => ioc.layoutService.setAppbarLoader(true)}
        onLoadEnd={() => ioc.layoutService.setAppbarLoader(false)}
        routes={routes}
        params={{ symbol }}
    />
);

export default PriceChartPage;
