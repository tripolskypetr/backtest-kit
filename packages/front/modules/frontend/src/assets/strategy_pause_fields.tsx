import { TypedField, FieldType, dayjs } from "react-declarative";
import { t } from "../i18n";

export const strategy_pause_fields: TypedField[] = [
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
                        name: "frameName",
                        title: t("Frame"),
                        readonly: true,
                        isVisible: (obj) => !!obj.frameName,
                        compute: (obj) => obj.frameName || t("Not specified"),
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
                        name: "paused",
                        title: t("State"),
                        readonly: true,
                        compute: (obj) => (obj.paused ? t("Paused") : t("Resumed")),
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
                        title: t("Changed At"),
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
                ],
            },
        ],
    },
];

export default strategy_pause_fields;
