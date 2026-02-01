import { TypedField, FieldType, dayjs, CopyButton } from "react-declarative";
import { Box } from "@mui/material";
import Markdown from "../components/common/Markdown";

export const signal_fields: TypedField[] = [
    {
        type: FieldType.Paper,
        transparentPaper: true,
        fieldBottomMargin: "1",
        fields: [
            {
                type: FieldType.Typography,
                                typoVariant: "h6",
                placeholder: "General Information",
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
                        title: "Symbol",
                        readonly: true,
                        compute: (obj) => obj.symbol || "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "position",
                        title: "Position",
                        readonly: true,
                        compute: (obj) => {
                            if (obj.position === "long") return "LONG";
                            if (obj.position === "short") return "SHORT";
                            return "Not specified";
                        },
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "status",
                        title: "Status",
                        readonly: true,
                        compute: (obj) => {
                            const statusMap: Record<string, string> = {
                                opened: "Opened",
                                scheduled: "Scheduled",
                                closed: "Closed",
                                cancelled: "Cancelled",
                            };
                            return (
                                statusMap[obj.status] || obj.status || "Unknown"
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
                        title: "Exchange",
                        readonly: true,
                        compute: (obj) => obj.exchangeName || "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "strategyName",
                        title: "Strategy",
                        readonly: true,
                        compute: (obj) => obj.strategyName || "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "minuteEstimatedTime",
                        title: "Estimated Time (min)",
                        readonly: true,
                        compute: (obj) =>
                            obj.minuteEstimatedTime?.toString() ||
                            "Not specified",
                    },
                ],
            },
            {
                type: FieldType.Typography,
                                typoVariant: "h6",
                placeholder: "Timestamps",
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
                        title: "Created",
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
                        title: "Updated",
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
                        title: "Scheduled",
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
                        title: "Activated",
                        readonly: true,
                        isVisible: (obj) => !!obj.pendingAt,
                        compute: (obj) =>
                            obj.pendingAt
                                ? dayjs(obj.pendingAt).format(
                                      "DD/MM/YYYY HH:mm:ss",
                                  )
                                : "N/A",
                    },
                ],
            },
            {
                type: FieldType.Typography,
                                typoVariant: "h6",
                placeholder: "Price Levels",
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
                        title: "Entry Price",
                        readonly: true,
                        compute: (obj) =>
                            obj.priceOpen
                                ? `${obj.priceOpen.toFixed(6)}$`
                                : "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "priceTakeProfit",
                        title: "Take Profit",
                        readonly: true,
                        compute: (obj) =>
                            obj.priceTakeProfit
                                ? `${obj.priceTakeProfit.toFixed(6)}$`
                                : "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "priceStopLoss",
                        title: "Stop Loss",
                        readonly: true,
                        compute: (obj) =>
                            obj.priceStopLoss
                                ? `${obj.priceStopLoss.toFixed(6)}$`
                                : "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "originalPriceTakeProfit",
                        title: "Original TP",
                        readonly: true,
                        isVisible: (obj) =>
                            obj.originalPriceTakeProfit != null &&
                            obj.originalPriceTakeProfit !== obj.priceTakeProfit,
                        compute: (obj) =>
                            obj.originalPriceTakeProfit
                                ? `${obj.originalPriceTakeProfit.toFixed(6)}$`
                                : "",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "originalPriceStopLoss",
                        title: "Original SL",
                        readonly: true,
                        isVisible: (obj) =>
                            obj.originalPriceStopLoss != null &&
                            obj.originalPriceStopLoss !== obj.priceStopLoss,
                        compute: (obj) =>
                            obj.originalPriceStopLoss
                                ? `${obj.originalPriceStopLoss.toFixed(6)}$`
                                : "",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "partialExecuted",
                        title: "Partial Closed",
                        readonly: true,
                        isVisible: (obj) => obj.partialExecuted > 0,
                        compute: (obj) =>
                            `${obj.partialExecuted?.toFixed(2) || 0}%`,
                    },
                ],
            },
            {
                type: FieldType.Typography,
                                typoVariant: "h6",
                placeholder: "Result (PNL)",
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
                        title: "PNL %",
                        readonly: true,
                        compute: (obj) => {
                            const pnl = obj.pnl?.pnlPercentage;
                            if (pnl == null) return "N/A";
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
                        title: "Entry Price (w/ fees)",
                        readonly: true,
                        compute: (obj) =>
                            obj.pnl?.priceOpen
                                ? `${obj.pnl.priceOpen.toFixed(6)}$`
                                : "N/A",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnl.priceClose",
                        title: "Exit Price",
                        readonly: true,
                        compute: (obj) =>
                            obj.pnl?.priceClose
                                ? `${obj.pnl.priceClose.toFixed(6)}$`
                                : "N/A",
                    },
                ],
            },
            {
                type: FieldType.Typography,
                                typoVariant: "h6",
                placeholder: "Note",
                isVisible: (data) => !!data.note,
            },
            {
                type: FieldType.Outline,
                isVisible: (data) => !!data.note,
                sx: { mb: 3 },
                child: {
                    type: FieldType.Component,
                    desktopColumns: "12",
                    tabletColumns: "12",
                    phoneColumns: "12",
                    name: "note",
                    element: ({ note }) => (
                        <Box>
                            <Markdown content={note || "No note"} />
                        </Box>
                    ),
                },
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
                            <CopyButton
                                label="Signal ID"
                                content={id}
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

export default signal_fields;
