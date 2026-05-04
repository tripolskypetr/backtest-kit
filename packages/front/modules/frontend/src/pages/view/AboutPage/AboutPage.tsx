import { IOutlet, OutletView } from "react-declarative";
import hasRouteMatch from "../../../utils/hasRouteMatch";
import ioc from "../../../lib";

import MainView from "./view/MainView";
import SetupView from "./view/SetupView";

const routes: IOutlet[] = [
    {
        id: "search",
        element: MainView,
        isActive: (pathname) => hasRouteMatch(["/about"], pathname),
    },
    {
        id: "main",
        element: SetupView,
        isActive: (pathname) => hasRouteMatch(["/about/setup"], pathname),
    },
];

export const AboutPage = () => (
    <OutletView
        history={ioc.routerService}
        onLoadStart={() => ioc.layoutService.setAppbarLoader(true)}
        onLoadEnd={() => ioc.layoutService.setAppbarLoader(false)}
        routes={routes}
    />
);

export default AboutPage;
