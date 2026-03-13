import { IOutletModal } from "react-declarative";
import BacktestView from "./view/BacktestView";
import LiveView from "./view/LiveView";
import BreakevenView from "./view/BreakevenView";
import RiskView from "./view/RiskView";
import PartialView from "./view/PartialView";
import HighestProfitView from "./view/HighestProfitView";
import ScheduleView from "./view/ScheduleView";
import PerformanceView from "./view/PerformanceView";
import SyncView from "./view/SyncView";
import HeatView from "./view/HeatView";

export const routes: IOutletModal[] = [
    {
        id: "backtest",
        element: BacktestView,
        isActive: (pathname) => pathname.includes("/markdown_report/backtest"),
    },
    {
        id: "live",
        element: LiveView,
        isActive: (pathname) => pathname.includes("/markdown_report/live"),
    },
    {
        id: "breakeven",
        element: BreakevenView,
        isActive: (pathname) => pathname.includes("/markdown_report/breakeven"),
    },
    {
        id: "risk",
        element: RiskView,
        isActive: (pathname) => pathname.includes("/markdown_report/risk"),
    },
    {
        id: "partial",
        element: PartialView,
        isActive: (pathname) => pathname.includes("/markdown_report/partial"),
    },
    {
        id: "highest_profit",
        element: HighestProfitView,
        isActive: (pathname) => pathname.includes("/markdown_report/highest_profit"),
    },
    {
        id: "schedule",
        element: ScheduleView,
        isActive: (pathname) => pathname.includes("/markdown_report/schedule"),
    },
    {
        id: "performance",
        element: PerformanceView,
        isActive: (pathname) => pathname.includes("/markdown_report/performance"),
    },
    {
        id: "sync",
        element: SyncView,
        isActive: (pathname) => pathname.includes("/markdown_report/sync"),
    },
    {
        id: "heat",
        element: HeatView,
        isActive: (pathname) => pathname.includes("/markdown_report/heat"),
    },
];

export default routes;
