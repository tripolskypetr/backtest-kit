/* eslint-disable max-lines */
import { ISwitchItem, heavy } from "react-declarative";
import { createRedirect } from "../utils/createRedirect";
import getMainRoute from "../utils/getMainRoute";
import { ioc } from "../lib";
import str from "../utils/str";
import ErrorPage from "../pages/base/ErrorPage";
import { HourglassTop, LiveTv } from "@mui/icons-material";
import PinePage from "../pages/view/PinePage";

export interface IRouteItem extends ISwitchItem {
    noHeader?: boolean;
    tabs?: ITab[];
}

export interface ITab {
    path: string;
    label: string;
    description: string;
    icon?: React.ComponentType<any>;
    visible?: boolean;
    disabled?: boolean;
    isActive: (dto: {
        routeItem: IRouteItem;
        routeParams: Record<string, string>;
        pathname: string;
    }) => boolean;
    navigate: (dto: {
        routeItem: IRouteItem;
        routeParams: Record<string, string>;
        pathname: string;
    }) => void;
}

export const baseRoutes: IRouteItem[] = [
    {
        path: "/error_page",
        noHeader: true,
        element: ErrorPage,
    },
    {
        path: "/pine_page",
        noHeader: true,
        element: heavy(() => import("../pages/view/PinePage")),
    },
];

const dashboardRoutes: IRouteItem[] = [
    {
        path: "/main",
        element: heavy(() => import("../pages/view/MainPage")),
    },
    {
        path: "/about",
        element: heavy(() => import("../pages/view/AboutPage")),
    },
    {
        path: "/about/setup",
        element: heavy(() => import("../pages/view/AboutPage")),
    },
    {
        path: "/overview",
        element: heavy(() => import("../pages/view/OverviewPage")),
    },
    {
        path: "/dashboard",
        tabs: [
            {
                label: "Backtest Measures",
                description: str.newline(
                    "KPI metrics computed from historical backtest simulation runs.",
                    "Includes success rate, trade performance, daily trade counts, and revenue aggregated across all symbols.",
                ),
                isActive: () => true,
                icon: HourglassTop,
                path: "/dashboard/backtest",
                navigate: () => ioc.routerService.push("/dashboard/backtest"),
            },
            {
                label: "Live Measures",
                description: str.newline(
                    "KPI metrics collected from real-time live trading activity.",
                    "Tracks live success rate, trade performance, daily trade counts, and revenue aggregated across all symbols.",
                ),
                isActive: () => false,
                icon: LiveTv,
                path: "/dashboard/live",
                navigate: () => ioc.routerService.push("/dashboard/live"),
            }
        ],
        element: heavy(() => import("../pages/view/DashboardPage")),
    },
    {
        path: "/dashboard/:mode",
        tabs: [
            {
                label: "Backtest Measures",
                description: str.newline(
                    "KPI metrics computed from historical backtest simulation runs.",
                    "Includes success rate, trade performance, daily trade counts, and revenue aggregated across all symbols.",
                ),
                isActive: ({ routeParams }) => routeParams.mode === "backtest",
                icon: HourglassTop,
                path: "/dashboard/backtest",
                navigate: () => ioc.routerService.push("/dashboard/backtest"),
            },
            {
                label: "Live Measures",
                description: str.newline(
                    "KPI metrics collected from real-time live trading activity.",
                    "Tracks live success rate, trade performance, daily trade counts, and revenue aggregated across all symbols.",
                ),
                isActive: ({ routeParams }) => routeParams.mode === "live",
                icon: LiveTv,
                path: "/dashboard/live",
                navigate: () => ioc.routerService.push("/dashboard/live"),
            }
        ],
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
    {
        path: "/dump/:search",
        element: heavy(() => import("../pages/view/DumpPage")),
    },
    {
        path: "/heat",
        element: heavy(() => import("../pages/view/HeatPage")),
    },
    {
        path: "/price_chart",
        element: heavy(() => import("../pages/view/PriceChartPage")),
    },
    {
        path: "/price_chart/:symbol",
        element: heavy(() => import("../pages/view/PriceChartPage")),
    },
    {
        path: "/price_chart/:symbol/:interval",
        element: heavy(() => import("../pages/view/PriceChartPage")),
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
