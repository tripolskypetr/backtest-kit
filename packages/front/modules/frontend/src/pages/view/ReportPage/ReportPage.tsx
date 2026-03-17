import { IOutlet, OutletView } from "react-declarative";
import hasRouteMatch from "../../../utils/hasRouteMatch";

import MainView from "./view/MainView";
import ioc from "../../../lib";

const routes: IOutlet[] = [
    {
        id: "main",
        element: MainView,
        isActive: (pathname) => hasRouteMatch(["/report"], pathname),
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
