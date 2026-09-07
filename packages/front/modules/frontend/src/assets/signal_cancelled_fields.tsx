import { ArrowForward } from "@mui/icons-material";
import { TypedField, FieldType, dayjs, CopyButton } from "react-declarative";
import ioc from "../lib";
import getPriceScale from "../utils/getPriceScale";
import Markdown from "../components/common/Markdown";
import toPlainString from "../helpers/toPlainString";
import { t } from "../i18n";

export const signal_cancelled_fields: TypedField[] = [
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
                        title: t("Event Time"),
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
                placeholder: t("Price Levels"),
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
                        name: "priceOpen",
                        title: t("Entry Price"),
                        readonly: true,
                        compute: (obj) =>
                            !!obj.priceOpen
                                ? `${obj.priceOpen.toFixed(getPriceScale(obj.priceOpen))}${t("$")}`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "currentPrice",
                        title: t("Market Price"),
                        readonly: true,
                        isVisible: (obj) => !!obj.currentPrice,
                        compute: (obj) =>
                            !!obj.currentPrice
                                ? `${obj.currentPrice.toFixed(getPriceScale(obj.currentPrice))}${t("$")}`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "cost",
                        title: t("Cost"),
                        readonly: true,
                        isVisible: (obj) => !!obj.cost,
                        compute: (obj) =>
                            !!obj.cost
                                ? `${obj.cost.toFixed(getPriceScale(obj.cost))}${t("$")}`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "multiplier",
                        title: t("Multiplier"),
                        readonly: true,
                        isVisible: (obj) => obj.multiplier != null,
                        compute: (obj) =>
                            obj.multiplier != null
                                ? `${obj.multiplier}x`
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
                                ? `${obj.priceTakeProfit.toFixed(getPriceScale(obj.priceTakeProfit))}${t("$")}`
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
                                ? `${obj.priceStopLoss.toFixed(getPriceScale(obj.priceStopLoss))}${t("$")}`
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
                                ? `${obj.originalPriceTakeProfit.toFixed(getPriceScale(obj.originalPriceTakeProfit))}${t("$")}`
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
                                ? `${obj.originalPriceStopLoss.toFixed(getPriceScale(obj.originalPriceStopLoss))}${t("$")}`
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
                                ? `${obj.originalPriceOpen.toFixed(getPriceScale(obj.originalPriceOpen))}${t("$")}`
                                : t("Not specified"),
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
                        isVisible: (obj) => !!obj.totalEntries && obj.totalEntries > 1,
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
                isVisible: (obj) => !!obj.pnlPriceClose,
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                isVisible: (obj) => !!obj.pnlPriceClose,
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
                            return `${sign}${v.toFixed(getPriceScale(v))}${t("$")}`;
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
                                ? `${obj.pnlEntries.toFixed(getPriceScale(obj.pnlEntries))}${t("$")}`
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
                                ? `${obj.pnlPriceOpen.toFixed(getPriceScale(obj.pnlPriceOpen))}${t("$")}`
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
                                ? `${obj.pnlPriceClose.toFixed(getPriceScale(obj.pnlPriceClose))}${t("$")}`
                                : t("N/A"),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Cancellation Details"),
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
                        name: "cancelReason",
                        title: t("Cancel Reason"),
                        readonly: true,
                        compute: (obj) => obj.cancelReason || t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        name: "cancelId",
                        title: t("Cancel ID"),
                        readonly: true,
                        isVisible: (obj) => !!obj.cancelId,
                        compute: (obj) => obj.cancelId || t("Not specified"),
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
                        isVisible: (obj) => !!obj.cancelId,
                        element: ({ cancelId }) => (
                            <CopyButton
                                label={t("Cancel ID")}
                                content={cancelId}
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

export default signal_cancelled_fields;
