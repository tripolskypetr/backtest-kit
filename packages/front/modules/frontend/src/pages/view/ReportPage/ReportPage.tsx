import { IOutlet, IOutletProps, OutletView } from "react-declarative";
import hasRouteMatch from "../../../utils/hasRouteMatch";

import MainView from "./view/MainView";
import ioc from "../../../lib";
import StatusView from "./view/StatusView";

const routes: IOutlet[] = [
    {
        id: "status",
        element: StatusView,
        isActive: (pathname) => hasRouteMatch(["/status/:id"], pathname),
        isAvailable: () => false,
    },
    {
        id: "main",
        element: MainView,
        isActive: (pathname) => hasRouteMatch(["/report"], pathname),
        isAvailable: () => false,
    },
];

interface IStatusPageProps {
    id: string;
}

export const StatusPage = ({ id }: IStatusPageProps) => (
    <OutletView
        history={ioc.routerService}
        onLoadStart={() => ioc.layoutService.setAppbarLoader(true)}
        onLoadEnd={() => ioc.layoutService.setAppbarLoader(false)}
        routes={routes}
        params={{ id }}
    />
);

export default StatusPage;
