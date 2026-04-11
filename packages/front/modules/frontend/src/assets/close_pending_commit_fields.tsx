import { ArrowForward } from "@mui/icons-material";
import { TypedField, FieldType, dayjs, CopyButton } from "react-declarative";
import ioc from "../lib";
import Markdown from "../components/common/Markdown";

export const close_pending_commit_fields: TypedField[] = [
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
                        name: "closeId",
                        title: "Close ID",
                        readonly: true,
                        isVisible: (obj) => !!obj.closeId,
                        compute: (obj) => obj.closeId || "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "signalId",
                        title: "Signal ID",
                        readonly: true,
                        trailingIcon: ArrowForward,
                        click: ({}, {}, { signalId }) => signalId && ioc.layoutService.pickSignal(signalId),
                        isVisible: (obj) => !!obj.signalId,
                        compute: (obj) => obj.signalId || "Not specified",
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: "Position Summary",
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
                        name: "originalPriceOpen",
                        title: "Original Entry",
                        readonly: true,
                        compute: (obj) =>
                            !!obj.originalPriceOpen
                                ? `${obj.originalPriceOpen.toFixed(6)}$`
                                : "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "totalEntries",
                        title: "Total Entries",
                        readonly: true,
                        isVisible: (obj) => !!obj.totalEntries && obj.totalEntries > 1,
                        compute: (obj) =>
                            !!obj.totalEntries
                                ? String(obj.totalEntries)
                                : "Not specified",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "totalPartials",
                        title: "Total Closes",
                        readonly: true,
                        isVisible: (obj) => !!obj.totalPartials && obj.totalPartials > 0,
                        compute: (obj) => String(obj.totalPartials),
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
                        name: "timestamp",
                        title: "Committed At",
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
                        title: "Created",
                        readonly: true,
                        compute: (obj) =>
                            obj.createdAt
                                ? dayjs(obj.createdAt).format("DD/MM/YYYY HH:mm:ss")
                                : "",
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: "PNL Details",
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
                        title: "PNL %",
                        readonly: true,
                        compute: (obj) => {
                            const pnl = obj.pnlPercentage;
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
                        name: "pnlCost",
                        title: "PNL ($)",
                        readonly: true,
                        compute: (obj) => {
                            const v = obj.pnlCost;
                            if (v == null) return "N/A";
                            const sign = v >= 0 ? "+" : "";
                            return `${sign}${v.toFixed(2)}$`;
                        },
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnlEntries",
                        title: "Invested",
                        readonly: true,
                        compute: (obj) =>
                            !!obj.pnlEntries
                                ? `${obj.pnlEntries.toFixed(2)}$`
                                : "N/A",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnlPriceOpen",
                        title: "PNL Entry Price",
                        readonly: true,
                        compute: (obj) =>
                            !!obj.pnlPriceOpen
                                ? `${obj.pnlPriceOpen.toFixed(6)}$`
                                : "N/A",
                    },
                    {
                        type: FieldType.Text,
                        outlined: false,
                        desktopColumns: "4",
                        tabletColumns: "4",
                        phoneColumns: "12",
                        name: "pnlPriceClose",
                        title: "PNL Exit Price",
                        readonly: true,
                        compute: (obj) =>
                            !!obj.pnlPriceClose
                                ? `${obj.pnlPriceClose.toFixed(6)}$`
                                : "N/A",
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: "Note",
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
                                label="Signal ID"
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

export default close_pending_commit_fields;
