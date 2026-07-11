import { TypedField, FieldType, dayjs, CopyButton } from "react-declarative";
import { Box } from "@mui/material";
import getPriceScale from "../utils/getPriceScale";
import Markdown from "../components/common/Markdown";
import toPlainString from "../helpers/toPlainString";
import { t } from "../i18n";

export const risk_fields: TypedField[] = [
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
                        title: t("Current Price"),
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
                        name: "activePositionCount",
                        title: t("Active Positions"),
                        readonly: true,
                        compute: (obj) =>
                            obj.activePositionCount?.toString() ?? "0",
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
                        title: t("Rejected At"),
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
                        title: t("Created"),
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
                placeholder: t("Rejection Details"),
            },
            {
                type: FieldType.Outline,
                sx: { mb: 3 },
                fields: [
                    {
                        type: FieldType.Text,
                        outlined: true,
                        inputRows: 3,
                        placeholder: t("Rejection note"),
                        title: "",
                        desktopColumns: "12",
                        tabletColumns: "12",
                        phoneColumns: "12",
                        name: "rejectionNote",
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Signal Details"),
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
                        name: "priceOpen",
                        title: t("Entry Price"),
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
                        name: "priceTakeProfit",
                        title: t("Take Profit"),
                        readonly: true,
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
                        name: "priceStopLoss",
                        title: t("Stop Loss"),
                        readonly: true,
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
                        name: "minuteEstimatedTime",
                        title: t("Estimated Time (min)"),
                        readonly: true,
                        isVisible: (obj) => !!obj.minuteEstimatedTime,
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
                        name: "rejectionId",
                        title: t("Rejection ID"),
                        readonly: true,
                        isVisible: (obj) => !!obj.rejectionId,
                        compute: (obj) => obj.rejectionId || t("Not specified"),
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
                        isVisible: (obj) => !!obj.signalId,
                        compute: (obj) => obj.signalId || t("Not specified"),
                    },
                ],
            },
            {
                type: FieldType.Typography,
                typoVariant: "h6",
                placeholder: t("Signal Note"),
                isVisible: (obj) => !!obj.signalNote,
            },
            {
                type: FieldType.Outline,
                isVisible: (obj) => !!obj.signalNote,
                sx: { mb: 3 },
                fields: [
                    {
                        type: FieldType.Component,
                        desktopColumns: "12",
                        tabletColumns: "12",
                        phoneColumns: "12",
                        element: ({ signalNote }) => (
                            <Markdown content={signalNote} />
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
                        isVisible: (obj) => !!obj.rejectionId,
                        element: ({ rejectionId }) => (
                            <CopyButton
                                label={`${t("Rejection ID")}: ${rejectionId}`}
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
                        isVisible: (obj) => !!obj.signalId,
                        element: ({ signalId }) => (
                            <CopyButton
                                label={`${t("Signal ID")}: ${signalId}`}
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

export default risk_fields;
