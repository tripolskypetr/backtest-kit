import { ITabsStep } from "react-declarative";
import { t } from "../../i18n";

export const tabs: ITabsStep[] = [
    {
        id: "backtest",
        label: t("Backtest"),
        isVisible: ({ type }) => type === "backtest",
    },
    {
        id: "live",
        label: t("Live"),
        isVisible: ({ type }) => type === "live",
    },
    {
        id: "strategy",
        label: t("Strategy"),
    },
    {
        id: "breakeven",
        label: t("Breakeven"),
    },
    {
        id: "risk",
        label: t("Risk"),
    },
    {
        id: "partial",
        label: t("Partial"),
    },
    {
        id: "highest_profit",
        label: t("Highest Profit"),
    },
    {
        id: "max_drawdown",
        label: t("Max Drawdown"),
    },
    {
        id: "schedule",
        label: t("Schedule"),
    },
    {
        id: "performance",
        label: t("Performance"),
    },
    {
        id: "sync",
        label: t("Sync"),
    },
    {
        id: "heat",
        label: t("Heat"),
    },
];

export default tabs;
