import { IOutlet, OutletView } from "react-declarative";
import hasRouteMatch from "../../../utils/hasRouteMatch";

import MainView from "./view/MainView";
import ioc from "../../../lib";

const routes: IOutlet[] = [
    {
        id: "main",
        element: MainView,
        isActive: (pathname) => hasRouteMatch(["/heat"], pathname),
    },
];

interface IHeatPageProps {
    id: string;
}

export const HeatPage = ({ id }: IHeatPageProps) => (
    <OutletView
        history={ioc.routerService}
        onLoadStart={() => ioc.layoutService.setAppbarLoader(true)}
        onLoadEnd={() => ioc.layoutService.setAppbarLoader(false)}
        routes={routes}
        params={{ id }}
    />
);

export default HeatPage;
