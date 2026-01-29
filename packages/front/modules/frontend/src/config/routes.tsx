/* eslint-disable max-lines */
import { ISwitchItem, heavy } from "react-declarative";
import { createRedirect } from "../utils/createRedirect";
import getMainRoute from "../utils/getMainRoute";
import { ioc } from "../lib";
import ErrorPage from "../pages/base/ErrorPage";
import MainPage from "../pages/view/MainPage";

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
        element: MainPage,
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
