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
        path: "/overview",
        element: heavy(() => import("../pages/view/OverviewPage")),
    },
    {
        path: "/dashboard",
        element: heavy(() => import("../pages/view/DashboardPage")),
    },
    {
        path: "/dashboard/:mode",
        element: heavy(() => import("../pages/view/DashboardPage")),
    },
    {
        path: "/notifications",
        element: heavy(() => import("../pages/view/NotificationPage")),
    },
    {
        path: "/logs",
        element: heavy(() => import("../pages/view/LogPage")),
    },
    {
        path: "/status",
        element: heavy(() => import("../pages/view/StatusPage")),
    },
    {
        path: "/status/:id",
        element: heavy(() => import("../pages/view/StatusPage")),
    },
    {
        path: "/report",
        element: heavy(() => import("../pages/view/ReportPage")),
    },
    {
        path: "/dump",
        element: heavy(() => import("../pages/view/DumpPage")),
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
