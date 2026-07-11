import { ArrowForward } from "@mui/icons-material";
import { TypedField, FieldType, dayjs, CopyButton } from "react-declarative";
import ioc from "../lib";
import getPriceScale from "../utils/getPriceScale";
import Markdown from "../components/common/Markdown";
import toPlainString from "../helpers/toPlainString";
import { t } from "../i18n";

export const average_buy_commit_fields: TypedField[] = [
    {
        type: FieldType.Paper,
        transparentPaper: true,
        fieldBottomMargin: "1",
        fields: [
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("General Information"),
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "symbol",
                        title: t("Symbol"),
                        readonly: true,
                        compute: (obj) => obj.symbol || t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "exchangeName",
                        title: t("Exchange"),
                        readonly: true,
                        compute: (obj) => obj.exchangeName || t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "strategyName",
                        title: t("Strategy"),
                        readonly: true,
                        compute: (obj) => obj.strategyName || t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "backtest",
                        title: t("Mode"),
                        readonly: true,
                        compute: (obj) => (obj.backtest ? t("Backtest") : t("Live")),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "currentPrice",
                        title: t("DCA Price"),
                        readonly: true,
                        compute: (obj) =>
                            !!obj.currentPrice
                                ? `${obj.currentPrice.toFixed(getPriceScale(obj.currentPrice))}$`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "signalId",
                        title: t("Signal ID"),
                        readonly: true,
                        trailingIcon: ArrowForward,
                        click: ({}, {}, { signalId }) => signalId && ioc.layoutService.pickSignal(signalId),
                        isVisible: (obj) => !!obj.signalId,
                        compute: (obj) => obj.signalId || t("Not specified"),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("DCA Details"),
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "position",
                        title: t("Position"),
                        readonly: true,
                        compute: (obj) => {
                            if (obj.position === "long") return "LONG";
                            if (obj.position === "short") return "SHORT";
                            return t("Not specified");
                        },
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "totalEntries",
                        title: t("Total Entries"),
                        readonly: true,
                        compute: (obj) =>
                            !!obj.totalEntries
                                ? String(obj.totalEntries)
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "effectivePriceOpen",
                        title: t("Avg Entry Price"),
                        readonly: true,
                        compute: (obj) =>
                            !!obj.effectivePriceOpen
                                ? `${obj.effectivePriceOpen.toFixed(getPriceScale(obj.effectivePriceOpen))}$`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "priceOpen",
                        title: t("Original Entry Price"),
                        readonly: true,
                        compute: (obj) =>
                            !!obj.priceOpen
                                ? `${obj.priceOpen.toFixed(getPriceScale(obj.priceOpen))}$`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "priceStopLoss",
                        title: t("Stop Loss"),
                        readonly: true,
                        isVisible: (obj) => !!obj.priceStopLoss,
                        compute: (obj) =>
                            !!obj.priceStopLoss
                                ? `${obj.priceStopLoss.toFixed(getPriceScale(obj.priceStopLoss))}$`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "priceTakeProfit",
                        title: t("Take Profit"),
                        readonly: true,
                        isVisible: (obj) => !!obj.priceTakeProfit,
                        compute: (obj) =>
                            !!obj.priceTakeProfit
                                ? `${obj.priceTakeProfit.toFixed(getPriceScale(obj.priceTakeProfit))}$`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "originalPriceStopLoss",
                        title: t("Original Stop Loss"),
                        readonly: true,
                        isVisible: (obj) => !!obj.originalPriceStopLoss,
                        compute: (obj) =>
                            !!obj.originalPriceStopLoss
                                ? `${obj.originalPriceStopLoss.toFixed(getPriceScale(obj.originalPriceStopLoss))}$`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "originalPriceTakeProfit",
                        title: t("Original Take Profit"),
                        readonly: true,
                        isVisible: (obj) => !!obj.originalPriceTakeProfit,
                        compute: (obj) =>
                            !!obj.originalPriceTakeProfit
                                ? `${obj.originalPriceTakeProfit.toFixed(getPriceScale(obj.originalPriceTakeProfit))}$`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "originalPriceOpen",
                        title: t("Original Entry"),
                        readonly: true,
                        isVisible: (obj) => !!obj.originalPriceOpen && obj.originalPriceOpen !== obj.priceOpen,
                        compute: (obj) =>
                            !!obj.originalPriceOpen
                                ? `${obj.originalPriceOpen.toFixed(getPriceScale(obj.originalPriceOpen))}$`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "cost",
                        title: t("Entry Cost"),
                        readonly: true,
                        isVisible: (obj) => !!obj.cost,
                        compute: (obj) =>
                            !!obj.cost
                                ? `${obj.cost.toFixed(getPriceScale(obj.cost))}$`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "totalPartials",
                        title: t("Total Closes"),
                        readonly: true,
                        isVisible: (obj) => !!obj.totalPartials && obj.totalPartials > 0,
                        compute: (obj) => String(obj.totalPartials),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("PNL Details"),
                isVisible: (obj) => !!obj.pnlPriceOpen,
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                isVisible: (obj) => !!obj.pnlPriceOpen,
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnlPercentage",
                        title: t("PNL %"),
                        readonly: true,
                        compute: (obj) => {
                            const pnl = obj.pnlPercentage;
                            if (pnl == null) return t("N/A");
                            const sign = pnl >= 0 ? "+" : "";
                            return `${sign}${pnl.toFixed(2)}%`;
                        },
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnlCost",
                        title: t("PNL ($)"),
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.pnlCost;
                            if (v == null) return t("N/A");
                            const sign = v >= 0 ? "+" : "";
                            return `${sign}${v.toFixed(getPriceScale(v))}$`;
                        },
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnlEntries",
                        title: t("Invested"),
                        readonly: true,
                        compute: (obj) =>
                            !!obj.pnlEntries
                                ? `${obj.pnlEntries.toFixed(getPriceScale(obj.pnlEntries))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnlPriceOpen",
                        title: t("PNL Entry Price"),
                        readonly: true,
                        compute: (obj) =>
                            !!obj.pnlPriceOpen
                                ? `${obj.pnlPriceOpen.toFixed(getPriceScale(obj.pnlPriceOpen))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnlPriceClose",
                        title: t("PNL Exit Price"),
                        readonly: true,
                        compute: (obj) =>
                            !!obj.pnlPriceClose
                                ? `${obj.pnlPriceClose.toFixed(getPriceScale(obj.pnlPriceClose))}$`
                                : t("N/A"),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Timestamps"),
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        name: "timestamp",
                        title: t("Executed At"),
                        readonly: true,
                        compute: (obj) =>
                            obj.timestamp
                                ? dayjs(obj.timestamp).format("DD/MM/YYYY HH:mm:ss")
                                : "",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        name: "createdAt",
                        title: t("Created"),
                        readonly: true,
                        compute: (obj) =>
                            obj.createdAt
                                ? dayjs(obj.createdAt).format("DD/MM/YYYY HH:mm:ss")
                                : "",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        name: "scheduledAt",
                        title: t("Scheduled At"),
                        readonly: true,
                        isVisible: (obj) => !!obj.scheduledAt,
                        compute: (obj) =>
                            obj.scheduledAt
                                ? dayjs(obj.scheduledAt).format("DD/MM/YYYY HH:mm:ss")
                                : "",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        name: "pendingAt",
                        title: t("Pending At"),
                        readonly: true,
                        isVisible: (obj) => !!obj.pendingAt,
                        compute: (obj) =>
                            obj.pendingAt
                                ? dayjs(obj.pendingAt).format("DD/MM/YYYY HH:mm:ss")
                                : "",
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Peak Profit"),
                isVisible: (obj) => !!obj.peakProfitPriceClose,
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                isVisible: (obj) => !!obj.peakProfitPriceClose,
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "peakProfitPercentage",
                        title: t("Peak Profit %"),
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.peakProfitPercentage;
                            if (v == null) return t("N/A");
                            const sign = v >= 0 ? "+" : "";
                            return `${sign}${v.toFixed(2)}%`;
                        },
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "peakProfitCost",
                        title: t("Peak Profit ($)"),
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.peakProfitCost;
                            if (v == null) return t("N/A");
                            const sign = v >= 0 ? "+" : "";
                            return `${sign}${v.toFixed(getPriceScale(v))}$`;
                        },
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "peakProfitPriceOpen",
                        title: t("Entry Price"),
                        readonly: true,
                        compute: (obj) =>
                            obj.peakProfitPriceOpen
                                ? `${obj.peakProfitPriceOpen.toFixed(getPriceScale(obj.peakProfitPriceOpen))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "peakProfitPriceClose",
                        title: t("Peak Price"),
                        readonly: true,
                        compute: (obj) =>
                            obj.peakProfitPriceClose
                                ? `${obj.peakProfitPriceClose.toFixed(getPriceScale(obj.peakProfitPriceClose))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "peakProfitEntries",
                        title: t("Invested"),
                        readonly: true,
                        compute: (obj) =>
                            obj.peakProfitEntries
                                ? `${obj.peakProfitEntries.toFixed(getPriceScale(obj.peakProfitEntries))}$`
                                : t("N/A"),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Max Drawdown"),
                isVisible: (obj) => !!obj.maxDrawdownPriceClose,
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                isVisible: (obj) => !!obj.maxDrawdownPriceClose,
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "maxDrawdownPercentage",
                        title: t("Max Drawdown %"),
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.maxDrawdownPercentage;
                            if (v == null) return t("N/A");
                            const sign = v >= 0 ? "+" : "";
                            return `${sign}${v.toFixed(2)}%`;
                        },
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "maxDrawdownCost",
                        title: t("Max Drawdown ($)"),
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.maxDrawdownCost;
                            if (v == null) return t("N/A");
                            const sign = v >= 0 ? "+" : "";
                            return `${sign}${v.toFixed(getPriceScale(v))}$`;
                        },
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "maxDrawdownPriceOpen",
                        title: t("Entry Price"),
                        readonly: true,
                        compute: (obj) =>
                            obj.maxDrawdownPriceOpen
                                ? `${obj.maxDrawdownPriceOpen.toFixed(getPriceScale(obj.maxDrawdownPriceOpen))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "maxDrawdownPriceClose",
                        title: t("Drawdown Price"),
                        readonly: true,
                        compute: (obj) =>
                            obj.maxDrawdownPriceClose
                                ? `${obj.maxDrawdownPriceClose.toFixed(getPriceScale(obj.maxDrawdownPriceClose))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "maxDrawdownEntries",
                        title: t("Invested"),
                        readonly: true,
                        compute: (obj) =>
                            obj.maxDrawdownEntries
                                ? `${obj.maxDrawdownEntries.toFixed(getPriceScale(obj.maxDrawdownEntries))}$`
                                : t("N/A"),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Note"),
                isVisible: (obj) => !!obj.note,
            },
            {
                type: FieldType.Outline,
                isVisible: (obj) => !!obj.note,
                sx: { mb: 3 },
                fields: [
                    {
                        type: FieldType.Component,
                        desktopColumns: "12",
                        tabletColumns: "12",
                        phoneColumns: "12",
                        element: ({ note }) => (
                            <Markdown content={note} />
                        ),
                    },
                    {
                        type: FieldType.Div,
                        style: { display: "none" },
                        child: {
                            type: FieldType.Text,
                            name: "node_print",
                            compute: ({ note }) => toPlainString(note),
                        }, 
                    },
                ],
            },
            {
                type: FieldType.Box,
                sx: {
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 1,
                },
                fields: [
                    {
                        type: FieldType.Component,
                        isVisible: (obj) => !!obj.signalId,
                        element: ({ signalId }) => (
                            <CopyButton
                                label={t("Signal ID")}
                                content={signalId}
                            />
                        ),
                    },
                    {
                        type: FieldType.Div,
                    },
                ],
            },
        ],
    },
];

export default average_buy_commit_fields;
