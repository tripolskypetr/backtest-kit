import { TypedField, FieldType, dayjs, CopyButton, copyToClipboard } from "react-declarative";
import { Box } from "@mui/material";
import Markdown from "../components/common/Markdown";
import toPlainString from "../helpers/toPlainString";
import { CopyAll } from "@mui/icons-material";
import ioc from "../lib";
import getPriceScale from "../utils/getPriceScale";
import { t } from "../i18n";

export const signal_fields: TypedField[] = [
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
                        name: "status",
                        title: t("Status"),
                        readonly: true,
                        compute: (obj) => {
                            const statusMap: Record<string, string> = {
                                opened: t("Opened"),
                                scheduled: t("Scheduled"),
                                closed: t("Closed"),
                                cancelled: t("Cancelled"),
                            };
                            return (
                                statusMap[obj.status] || obj.status || t("Unknown")
                            );
                        },
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
                        name: "minuteEstimatedTime",
                        title: t("Estimated Time (min)"),
                        readonly: true,
                        compute: (obj) =>
                            obj.minuteEstimatedTime?.toString() ||
                            t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "id",
                        title: t("Signal ID"),
                        readonly: true,
                        compute: (obj) => obj.id || t("Not specified"),
                        trailingIcon: CopyAll,
                        trailingIconClick: async (id) => { 
                            if (await copyToClipboard(id as string)) {
                                ioc.alertService.notify(t("Copied!"));
                            }
                        },
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
                        name: "createdAt",
                        title: t("Created"),
                        readonly: true,
                        compute: (obj) =>
                            obj.createdAt
                                ? dayjs(obj.createdAt).format(
                                      "DD/MM/YYYY HH:mm:ss",
                                  )
                                : "",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        name: "updatedAt",
                        title: t("Updated"),
                        readonly: true,
                        compute: (obj) =>
                            obj.updatedAt
                                ? dayjs(obj.updatedAt).format(
                                      "DD/MM/YYYY HH:mm:ss",
                                  )
                                : "",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        name: "scheduledAt",
                        title: t("Scheduled"),
                        readonly: true,
                        isVisible: (obj) => !!obj.scheduledAt,
                        compute: (obj) =>
                            obj.scheduledAt
                                ? dayjs(obj.scheduledAt).format(
                                      "DD/MM/YYYY HH:mm:ss",
                                  )
                                : "",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        name: "pendingAt",
                        title: t("Activated"),
                        readonly: true,
                        isVisible: (obj) => !!obj.pendingAt,
                        compute: (obj) =>
                            obj.pendingAt
                                ? dayjs(obj.pendingAt).format(
                                      "DD/MM/YYYY HH:mm:ss",
                                  )
                                : t("N/A"),
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
                            obj.priceOpen
                                ? `${obj.priceOpen.toFixed(getPriceScale(obj.priceOpen))}$`
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
                        compute: (obj) =>
                            obj.priceTakeProfit
                                ? `${obj.priceTakeProfit.toFixed(getPriceScale(obj.priceTakeProfit))}$`
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
                        compute: (obj) =>
                            obj.priceStopLoss
                                ? `${obj.priceStopLoss.toFixed(getPriceScale(obj.priceStopLoss))}$`
                                : t("Not specified"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "originalPriceTakeProfit",
                        title: t("Original TP"),
                        readonly: true,
                        isVisible: (obj) =>
                            !!obj.originalPriceTakeProfit &&
                            obj.originalPriceTakeProfit !== obj.priceTakeProfit,
                        compute: (obj) =>
                            obj.originalPriceTakeProfit
                                ? `${obj.originalPriceTakeProfit.toFixed(getPriceScale(obj.originalPriceTakeProfit))}$`
                                : "",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "originalPriceStopLoss",
                        title: t("Original SL"),
                        readonly: true,
                        isVisible: (obj) =>
                            !!obj.originalPriceStopLoss &&
                            obj.originalPriceStopLoss !== obj.priceStopLoss,
                        compute: (obj) =>
                            obj.originalPriceStopLoss
                                ? `${obj.originalPriceStopLoss.toFixed(getPriceScale(obj.originalPriceStopLoss))}$`
                                : "",
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
                        isVisible: (obj) =>
                            !!obj.originalPriceOpen &&
                            obj.originalPriceOpen !== obj.priceOpen,
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
                        name: "totalEntries",
                        title: t("Total Entries"),
                        readonly: true,
                        isVisible: (obj) =>
                            !!obj.totalEntries && obj.totalEntries > 1,
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
                        name: "partialExecuted",
                        title: t("Partial Closed"),
                        readonly: true,
                        isVisible: (obj) => obj.partialExecuted > 0,
                        compute: (obj) =>
                            `${obj.partialExecuted?.toFixed(2) || 0}%`,
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
                        isVisible: (obj) =>
                            !!obj.totalPartials && obj.totalPartials > 0,
                        compute: (obj) => String(obj.totalPartials),
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
                                ? `${obj.cost.toFixed(getPriceScale(obj.cost))}$`
                                : t("Not specified"),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Result (PNL)"),
                isVisible: (data) => data.status === "closed" && data.pnl,
            },
            {
                type: FieldType.Outline,
                isVisible: (data) => data.status === "closed" && data.pnl,
                sx: { mb: 3 },
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnl.pnlPercentage",
                        title: t("PNL %"),
                        readonly: true,
                        compute: (obj) => {
                            const pnl = obj.pnl?.pnlPercentage;
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
                        name: "pnl.priceOpen",
                        title: t("Entry Price (w/ fees)"),
                        readonly: true,
                        compute: (obj) =>
                            obj.pnl?.priceOpen
                                ? `${obj.pnl.priceOpen.toFixed(getPriceScale(obj.pnl.priceOpen))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnl.priceClose",
                        title: t("Exit Price"),
                        readonly: true,
                        compute: (obj) =>
                            obj.pnl?.priceClose
                                ? `${obj.pnl.priceClose.toFixed(getPriceScale(obj.pnl.priceClose))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnl.pnlCost",
                        title: t("PNL ($)"),
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.pnl?.pnlCost;
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
                        name: "pnl.pnlEntries",
                        title: t("Invested"),
                        readonly: true,
                        compute: (obj) =>
                            !!obj.pnl?.pnlEntries
                                ? `${obj.pnl.pnlEntries.toFixed(getPriceScale(obj.pnl.pnlEntries))}$`
                                : t("N/A"),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Peak Profit"),
                isVisible: (obj) => !!obj.peakProfit?.priceClose,
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                isVisible: (obj) => !!obj.peakProfit?.priceClose,
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "peakProfit.pnlPercentage",
                        title: t("Peak Profit %"),
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.peakProfit?.pnlPercentage;
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
                        name: "peakProfit.pnlCost",
                        title: t("Peak Profit ($)"),
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.peakProfit?.pnlCost;
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
                        name: "peakProfit.priceOpen",
                        title: t("Entry Price"),
                        readonly: true,
                        compute: (obj) =>
                            obj.peakProfit?.priceOpen
                                ? `${obj.peakProfit.priceOpen.toFixed(getPriceScale(obj.peakProfit.priceOpen))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "peakProfit.priceClose",
                        title: t("Peak Price"),
                        readonly: true,
                        compute: (obj) =>
                            obj.peakProfit?.priceClose
                                ? `${obj.peakProfit.priceClose.toFixed(getPriceScale(obj.peakProfit.priceClose))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "peakProfit.pnlEntries",
                        title: t("Invested"),
                        readonly: true,
                        compute: (obj) =>
                            obj.peakProfit?.pnlEntries
                                ? `${obj.peakProfit.pnlEntries.toFixed(getPriceScale(obj.peakProfit.pnlEntries))}$`
                                : t("N/A"),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Max Drawdown"),
                isVisible: (obj) => !!obj.maxDrawdown?.priceClose,
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                isVisible: (obj) => !!obj.maxDrawdown?.priceClose,
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "maxDrawdown.pnlPercentage",
                        title: t("Max Drawdown %"),
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.maxDrawdown?.pnlPercentage;
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
                        name: "maxDrawdown.pnlCost",
                        title: t("Max Drawdown ($)"),
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.maxDrawdown?.pnlCost;
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
                        name: "maxDrawdown.priceOpen",
                        title: t("Entry Price"),
                        readonly: true,
                        compute: (obj) =>
                            obj.maxDrawdown?.priceOpen
                                ? `${obj.maxDrawdown.priceOpen.toFixed(getPriceScale(obj.maxDrawdown.priceOpen))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "maxDrawdown.priceClose",
                        title: t("Drawdown Price"),
                        readonly: true,
                        compute: (obj) =>
                            obj.maxDrawdown?.priceClose
                                ? `${obj.maxDrawdown.priceClose.toFixed(getPriceScale(obj.maxDrawdown.priceClose))}$`
                                : t("N/A"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "maxDrawdown.pnlEntries",
                        title: t("Invested"),
                        readonly: true,
                        compute: (obj) =>
                            obj.maxDrawdown?.pnlEntries
                                ? `${obj.maxDrawdown.pnlEntries.toFixed(getPriceScale(obj.maxDrawdown.pnlEntries))}$`
                                : t("N/A"),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Note"),
                isVisible: (data) => !!data.note,
            },
            {
                type: FieldType.Outline,
                isVisible: (data) => !!data.note,
                sx: { mb: 3 },
                fields: [
                    {
                        type: FieldType.Component,
                        desktopColumns: "12",
                        tabletColumns: "12",
                        phoneColumns: "12",
                        element: ({ note }) => (
                            <Markdown
                              content={note}
                            />
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
                },
                fields: [
                    {
                        type: FieldType.Component,
                        element: ({ id }) => (
                            <CopyButton label={t("Signal ID")} content={id} />
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

export default signal_fields;
