import { IOutlet, OutletView } from "react-declarative";
import hasRouteMatch from "../../../utils/hasRouteMatch";

import MainView from "./view/MainView";
import ioc from "../../../lib";

const routes: IOutlet[] = [
    {
        id: "search",
        element: MainView,
        isActive: (pathname) => hasRouteMatch(["/dump/:search"], pathname),
    },
    {
        id: "main",
        element: MainView,
        isActive: (pathname) => hasRouteMatch(["/dump"], pathname),
    },
];

interface IDumpPageProps {
    search: string;
}

export const DumpPage = ({
    search = "",
}: IDumpPageProps) => (
    <OutletView
        history={ioc.routerService}
        onLoadStart={() => ioc.layoutService.setAppbarLoader(true)}
        onLoadEnd={() => ioc.layoutService.setAppbarLoader(false)}
        routes={routes}
        params={{ search }}
    />
);

export default DumpPage;
