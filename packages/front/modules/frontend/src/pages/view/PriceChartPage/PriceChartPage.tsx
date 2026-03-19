import { IOutlet, OutletView } from "react-declarative";
import hasRouteMatch from "../../../utils/hasRouteMatch";

import FirstView from "./view/FirstView";
import SecondView from "./view/SecondView";
import ThirdView from "./view/ThirdView";
import ioc from "../../../lib";

const routes: IOutlet[] = [
    {
        id: "chart",
        element: ThirdView,
        isActive: (pathname) => hasRouteMatch(["/price_chart/:symbol/:interval"], pathname),
    },
    {
        id: "coin",
        element: SecondView,
        isActive: (pathname) => hasRouteMatch(["/price_chart/:symbol"], pathname),
    },
    {
        id: "main",
        element: FirstView,
        isActive: (pathname) => hasRouteMatch(["/price_chart"], pathname),
    },
];

interface IPriceChartPageProps {
    symbol: string;
    interval: string;
}

export const PriceChartPage = ({ symbol, interval }: IPriceChartPageProps) => (
    <OutletView
        history={ioc.routerService}
        onLoadStart={() => ioc.layoutService.setAppbarLoader(true)}
        onLoadEnd={() => ioc.layoutService.setAppbarLoader(false)}
        routes={routes}
        params={{ symbol, interval }}
    />
);

export default PriceChartPage;
