import { TypedField, FieldType, dayjs, copyToClipboard } from "react-declarative";
import { List, ListItemButton, ListItemText, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ioc from "../lib";
import getPriceScale from "../utils/getPriceScale";
import { t } from "../i18n";
import CopyIcon from "../components/common/CopyIcon";

/**
 * "Position History" section shared by the signal card and every
 * notification layout: a heading plus three half-width groups listing the
 * public row's partials, entries and accruals (each with its note and the
 * price recorded at commit time). Spread it into a Paper's fields right
 * before the trailing copy-id buttons; every group hides itself when its
 * array is empty and the heading hides when all three are.
 */
export const position_history_fields: TypedField[] = [
    {
        type: FieldType.Typography,
        typoVariant: "h6",
        placeholder: t("Position History"),
        isVisible: (obj) =>
            (Array.isArray(obj.partials) && !!obj.partials.length) ||
            (Array.isArray(obj.entries) && !!obj.entries.length) ||
            (Array.isArray(obj.accruals) && !!obj.accruals.length),
    },
    {
        type: FieldType.Outline,
        desktopColumns: "6",
        tabletColumns: "12",
        phoneColumns: "12",
        fieldRightMargin: "1",
        fieldBottomMargin: "1",
        innerPadding: "0px",
        isVisible: (data) => Array.isArray(data.partials) && !!data.partials.length,
        fields: [
            {
                type: FieldType.Box,
                sx: {
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    padding: "15px",
                },
                fields: [
                    {
                        type: FieldType.Div,
                        fields: [
                            {
                                type: FieldType.Typography,
                                fieldBottomMargin: "1",
                                typoVariant: "h6",
                                placeholder: t("Partials"),
                            },
                            {
                                type: FieldType.Typography,
                                fieldBottomMargin: "0",
                                style: { opacity: 0.5, },
                                typoVariant: "body2",
                                placeholder: t("Partial close history of the position"),
                            },
                        ]
                    },
                    {
                        type: FieldType.Component,
                        element: ({ signalId, partials }) => (
                            <CopyIcon 
                                onClick={(_, doCopy) => {
                                    doCopy(JSON.stringify({ signalId, partials }, null, 2))
                                }}
                            />
                        )
                    }
                ],
            },
            {
                type: FieldType.Component,
                sx: {
                    overflowY: "auto",
                    minHeight: "384px",
                    maxHeight: "384px",
                },
                element: ({ partials }) => (
                    <List dense disablePadding>
                        {partials.map((row, idx) => (
                            <ListItemButton
                                key={idx} 
                                sx={{    
                                    background: (theme) =>
                                        idx % 2 === 0
                                            ? alpha(
                                                theme.palette.getContrastText(theme.palette.background.paper),
                                                0.04
                                            )
                                            : "transparent",
                                }}
                                onClick={async () => {
                                    if (
                                        await copyToClipboard(
                                            JSON.stringify(
                                                { ...row, id: undefined, idx: undefined },
                                                null,
                                                2,
                                            ),
                                        )
                                    ) {
                                        ioc.alertService.notify(t("Copied!"));
                                    }
                                }}
                            >
                                <ListItemText
                                    primary={`${row.type === "profit" ? t("Partial Profit") : t("Partial Loss")} ${row.percent}% ${t("at")} ${row.currentPrice.toFixed(getPriceScale(row.currentPrice))}${t("$")}`}
                                    secondary={[`${t("Cost basis")}: ${row.costBasisAtClose.toFixed(getPriceScale(row.costBasisAtClose))}${t("$")}`, `${t("Entries at close")}: ${row.entryCountAtClose}`, row.note].filter(Boolean).join(" · ")}
                                />
                                <Typography variant="body1">{dayjs(row.timestamp).format("DD/MM/YYYY HH:mm:ss")}</Typography>
                            </ListItemButton>
                        ))}
                    </List>
                ),
            },
        ],
    },
    {
        type: FieldType.Outline,
        desktopColumns: "6",
        tabletColumns: "12",
        phoneColumns: "12",
        fieldRightMargin: "1",
        fieldBottomMargin: "1",
        innerPadding: "0px",
        isVisible: (data) => Array.isArray(data.entries) && !!data.entries.length,
        fields: [
            {
                type: FieldType.Box,
                sx: {
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    padding: "15px",
                },
                fields: [
                    {
                        type: FieldType.Div,
                        fields: [
                            {
                                type: FieldType.Typography,
                                fieldBottomMargin: "1",
                                typoVariant: "h6",
                                placeholder: t("Entries"),
                            },
                            {
                                type: FieldType.Typography,
                                fieldBottomMargin: "0",
                                style: { opacity: 0.5, },
                                typoVariant: "body2",
                                placeholder: t("DCA entry history of the position"),
                            },
                        ]
                    },
                    {
                        type: FieldType.Component,
                        element: ({ signalId, entries }) => (
                            <CopyIcon 
                                onClick={(_, doCopy) => {
                                    doCopy(JSON.stringify({ signalId, entries }, null, 2))
                                }}
                            />
                        )
                    }
                ],
            },
            {
                type: FieldType.Component,
                sx: {
                    overflowY: "auto",
                    minHeight: "384px",
                    maxHeight: "384px",
                },
                element: ({ entries }) => (
                    <List dense disablePadding>
                        {entries.map((row, idx) => (
                            <ListItemButton
                                key={idx} 
                                sx={{    
                                    background: (theme) =>
                                        idx % 2 === 0
                                            ? alpha(
                                                theme.palette.getContrastText(theme.palette.background.paper),
                                                0.04
                                            )
                                            : "transparent",
                                }}
                                onClick={async () => {
                                    if (
                                        await copyToClipboard(
                                            JSON.stringify(
                                                { ...row, id: undefined, idx: undefined },
                                                null,
                                                2,
                                            ),
                                        )
                                    ) {
                                        ioc.alertService.notify(t("Copied!"));
                                    }
                                }}
                            >
                                <ListItemText
                                    primary={`${t("Entry")} #${idx + 1}: ${row.price.toFixed(getPriceScale(row.price))}${t("$")}`}
                                    secondary={[`${t("Cost")}: ${row.cost.toFixed(getPriceScale(row.cost))}${t("$")}`, row.note].filter(Boolean).join(" · ")}
                                />
                                <Typography variant="body1">{dayjs(row.timestamp).format("DD/MM/YYYY HH:mm:ss")}</Typography>
                            </ListItemButton>
                        ))}
                    </List>
                ),
            },
        ],
    },
    {
        type: FieldType.Outline,
        desktopColumns: "6",
        tabletColumns: "12",
        phoneColumns: "12",
        fieldRightMargin: "1",
        fieldBottomMargin: "1",
        innerPadding: "0px",
        isVisible: (data) => Array.isArray(data.accruals) && !!data.accruals.length,
        fields: [
            {
                type: FieldType.Box,
                sx: {
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    padding: "15px",
                },
                fields: [
                    {
                        type: FieldType.Div,
                        fields: [
                            {
                                type: FieldType.Typography,
                                fieldBottomMargin: "1",
                                typoVariant: "h6",
                                placeholder: t("Dividends"),
                            },
                            {
                                type: FieldType.Typography,
                                fieldBottomMargin: "0",
                                style: { opacity: 0.5, },
                                typoVariant: "body2",
                                placeholder: t("Dividend / staking accruals of the position"),
                            },
                        ]
                    },
                    {
                        type: FieldType.Component,
                        element: ({ signalId, accruals }) => (
                            <CopyIcon 
                                onClick={(_, doCopy) => {
                                    doCopy(JSON.stringify({ signalId, accruals }, null, 2))
                                }}
                            />
                        )
                    }
                ],
            },
            {
                type: FieldType.Component,
                sx: {
                    overflowY: "auto",
                    minHeight: "384px",
                    maxHeight: "384px",
                },
                element: ({ accruals }) => (
                    <List dense disablePadding>
                        {accruals.map((row, idx) => (
                            <ListItemButton
                                key={idx} 
                                sx={{    
                                    background: (theme) =>
                                        idx % 2 === 0
                                            ? alpha(
                                                theme.palette.getContrastText(theme.palette.background.paper),
                                                0.04
                                            )
                                            : "transparent",
                                }}
                                onClick={async () => {
                                    if (
                                        await copyToClipboard(
                                            JSON.stringify(
                                                { ...row, id: undefined, idx: undefined },
                                                null,
                                                2,
                                            ),
                                        )
                                    ) {
                                        ioc.alertService.notify(t("Copied!"));
                                    }
                                }}
                            >
                                <ListItemText
                                    primary={`${t("Dividend")} ${row.type === "cash" ? `${row.amount.toFixed(getPriceScale(row.amount))}${t("$")}` : `${row.amount} ${t("asset")}`}`}
                                    secondary={[t(row.type), `${t("Price")}: ${row.currentPrice.toFixed(getPriceScale(row.currentPrice))}${t("$")}`, row.note].filter(Boolean).join(" · ")}
                                />
                                <Typography variant="body1">{dayjs(row.timestamp).format("DD/MM/YYYY HH:mm:ss")}</Typography>
                            </ListItemButton>
                        ))}
                    </List>
                ),
            },
        ],
    },
];

export default position_history_fields;
