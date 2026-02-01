import { TypedField, FieldType, dayjs, CopyButton } from "react-declarative";
import { Box } from "@mui/material";
import Markdown from "../components/common/Markdown";

export const risk_fields: TypedField[] = [
    {
        type: FieldType.Paper,
        transparentPaper: true,
        fieldBottomMargin: "1",
        fields: [
            {
                type: FieldType.Typography,
                style: { color: "#2196f3" },
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
                        name: "backtest",
                        title: "Mode",
                        readonly: true,
                        compute: (obj) => (obj.backtest ? "Backtest" : "Live"),
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "currentPrice",
                        title: "Current Price",
                        readonly: true,
                        compute: (obj) =>
                            obj.currentPrice != null
                                ? `${obj.currentPrice.toFixed(6)}$`
                                : "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "activePositionCount",
                        title: "Active Positions",
                        readonly: true,
                        compute: (obj) =>
                            obj.activePositionCount?.toString() ?? "0",
                    },
                ],
            },
            {
                type: FieldType.Typography,
                style: { color: "#2196f3" },
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
                        name: "timestamp",
                        title: "Rejected At",
                        readonly: true,
                        compute: (obj) =>
                            obj.timestamp
                                ? dayjs(obj.timestamp).format(
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
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: "Rejection Details",
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                child: {
                    type: FieldType.Component,
                    desktopColumns: "12",
                    tabletColumns: "12",
                    phoneColumns: "12",
                    name: "rejectionNote",
                    element: ({ rejectionNote }) => (
                        <Box>
                            <Markdown
                                content={
                                    rejectionNote ||
                                    "No rejection reason provided"
                                }
                            />
                        </Box>
                    ),
                },
            },
            {
                type: FieldType.Typography,
                style: { color: "#2196f3" },
                typoVariant: "h6",
                placeholder: "Pending Signal",
                isVisible: (data) => !!data.pendingSignal,
            },
            {
                type: FieldType.Outline,
                isVisible: (data) => !!data.pendingSignal,
                sx: { mb: 3 },
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pendingSignal.position",
                        title: "Position",
                        readonly: true,
                        compute: (obj) => {
                            const position = obj.pendingSignal?.position;
                            if (position === "long") return "LONG";
                            if (position === "short") return "SHORT";
                            return "Not specified";
                        },
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pendingSignal.priceOpen",
                        title: "Entry Price",
                        readonly: true,
                        compute: (obj) =>
                            obj.pendingSignal?.priceOpen != null
                                ? `${obj.pendingSignal.priceOpen.toFixed(6)}$`
                                : "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pendingSignal.priceTakeProfit",
                        title: "Take Profit",
                        readonly: true,
                        compute: (obj) =>
                            obj.pendingSignal?.priceTakeProfit != null
                                ? `${obj.pendingSignal.priceTakeProfit.toFixed(6)}$`
                                : "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pendingSignal.priceStopLoss",
                        title: "Stop Loss",
                        readonly: true,
                        compute: (obj) =>
                            obj.pendingSignal?.priceStopLoss != null
                                ? `${obj.pendingSignal.priceStopLoss.toFixed(6)}$`
                                : "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pendingSignal.minuteEstimatedTime",
                        title: "Estimated Time (min)",
                        readonly: true,
                        isVisible: (obj) =>
                            obj.pendingSignal?.minuteEstimatedTime != null,
                        compute: (obj) =>
                            obj.pendingSignal?.minuteEstimatedTime?.toString() ||
                            "Not specified",
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
                        isVisible: (obj) => !!obj.rejectionId,
                        element: ({ rejectionId }) => (
                            <CopyButton
                                label={`Rejection ID: ${rejectionId}`}
                                content={rejectionId}
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
                        isVisible: (obj) => !!obj.pendingSignal?.id,
                        element: ({ pendingSignal }) => (
                            <CopyButton
                                label={`Signal ID: ${pendingSignal.id}`}
                                content={pendingSignal.id}
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

export default risk_fields;
