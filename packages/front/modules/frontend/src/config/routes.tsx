/* eslint-disable max-lines */
import { ISwitchItem, heavy } from "react-declarative";
import { createRedirect } from "../utils/createRedirect";
import getMainRoute from "../utils/getMainRoute";
import { ioc } from "../lib";
import ErrorPage from "../pages/base/ErrorPage";

export interface IRouteItem extends ISwitchItem {
    noHeader?: boolean;
}

export const baseRoutes: IRouteItem[] = [
    {
        path: "/error_page",
        noHeader: true,
        element: ErrorPage,
    },
];

const dashboardRoutes: IRouteItem[] = [
    {
        path: "/main",
        element: heavy(() => import("../pages/view/MainPage")),
    },
    {
        path: "/dashboard/:mode",
        element: heavy(() => import("../pages/view/DashboardPage")),
    },
    {
        path: "/logs",
        element: heavy(() => import("../pages/view/LogPage")),
    },
];

export const routes: IRouteItem[] = [
    {
        path: "/",
        element: createRedirect(async () => {
            ioc.routerService.push(await getMainRoute());
        }),
    },
    ...baseRoutes,
    ...dashboardRoutes,
];

export default routes;
