import { ITabsStep } from "react-declarative";

export const tabs: ITabsStep[] = [
    {
        id: "backtest",
        label: "Backtest",
        isVisible: ({ type }) => type === "backtest",
    },
    {
        id: "live",
        label: "Live",
        isVisible: ({ type }) => type === "live",
    },
    {
        id: "strategy",
        label: "Strategy",
    },
    {
        id: "breakeven",
        label: "Breakeven",
    },
    {
        id: "risk",
        label: "Risk",
    },
    {
        id: "partial",
        label: "Partial",
    },
    {
        id: "highest_profit",
        label: "Highest Profit",
    },
    {
        id: "schedule",
        label: "Schedule",
    },
    {
        id: "performance",
        label: "Performance",
    },
    {
        id: "sync",
        label: "Sync",
    },
    {
        id: "heat",
        label: "Heat",
    },
];

export default tabs;
