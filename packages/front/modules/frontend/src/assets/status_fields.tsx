import { TypedField, FieldType } from "react-declarative";

import {
    AccountBalance,
    AttachMoney,
    CallMade,
    CallReceived,
    DonutLarge,
    Layers,
    PieChart,
    TrendingDown,
    TrendingUp,
} from "@mui/icons-material";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import IndicatorValueWidget from "../widgets/IndicatorValueWidget";

const CC_CELL_PADDING = "7px";

const COLOR_GREEN = "#7FB537";
const COLOR_RED = "#da4453";
const COLOR_BLUE = "#4FC0E8";
const COLOR_ORANGE = "#FE9B31";
const COLOR_PURPLE = "#967adc";

const pnlColor = (value: number) => (value >= 0 ? COLOR_GREEN : COLOR_RED);

export const status_fields: TypedField[] = [
    // ── Row 1: 4 indicator widgets ─────────────────────────────────────
    {
        type: FieldType.Group,
        columns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        fieldRightMargin: CC_CELL_PADDING,
        fieldBottomMargin: CC_CELL_PADDING,
        fields: [
            {
                type: FieldType.Hero,
                height: `max(calc(100vh * 0.2), 150px)`,
                minHeight: "185px",
                columns: "3",
                tabletColumns: "6",
                phoneColumns: "12",
                bottom: CC_CELL_PADDING,
                right: CC_CELL_PADDING,
                child: {
                    type: FieldType.Component,
                    element: ({ pnlPercentage }) => (
                        <IndicatorValueWidget
                            color={pnlColor(pnlPercentage)}
                            label="PNL %"
                            value={`${pnlPercentage >= 0 ? "+" : ""}${pnlPercentage.toFixed(2)}%`}
                            icon={pnlPercentage >= 0 ? TrendingUp : TrendingDown}
                        />
                    ),
                },
            },
            {
                type: FieldType.Hero,
                height: `max(calc(100vh * 0.2), 150px)`,
                minHeight: "185px",
                columns: "3",
                tabletColumns: "6",
                phoneColumns: "12",
                bottom: CC_CELL_PADDING,
                right: CC_CELL_PADDING,
                child: {
                    type: FieldType.Component,
                    element: ({ pnlCost }) => (
                        <IndicatorValueWidget
                            color={pnlColor(pnlCost)}
                            label="PNL $"
                            value={`${pnlCost >= 0 ? "+" : ""}$${Math.abs(pnlCost).toFixed(2)}`}
                            icon={AttachMoney}
                        />
                    ),
                },
            },
            {
                type: FieldType.Hero,
                height: `max(calc(100vh * 0.2), 150px)`,
                minHeight: "185px",
                columns: "3",
                tabletColumns: "6",
                phoneColumns: "12",
                bottom: CC_CELL_PADDING,
                right: CC_CELL_PADDING,
                child: {
                    type: FieldType.Component,
                    element: ({ pnlEntries }) => (
                        <IndicatorValueWidget
                            color={COLOR_BLUE}
                            label="Invested $"
                            value={`$${pnlEntries.toFixed(2)}`}
                            icon={AccountBalance}
                        />
                    ),
                },
            },
            {
                type: FieldType.Hero,
                height: `max(calc(100vh * 0.2), 150px)`,
                minHeight: "185px",
                columns: "3",
                tabletColumns: "6",
                phoneColumns: "12",
                bottom: CC_CELL_PADDING,
                right: CC_CELL_PADDING,
                child: {
                    type: FieldType.Component,
                    element: ({ totalEntries }) => (
                        <IndicatorValueWidget
                            color={COLOR_ORANGE}
                            label="DCA Entries"
                            value={totalEntries}
                            icon={Layers}
                        />
                    ),
                },
            },
        ],
    },

    // ── Row 2: Price Levels (left) + Partials (right) ──────────────────
    {
        type: FieldType.Group,
        columns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        fields: [
            // Center-left: Price Levels
            {
                type: FieldType.Hero,
                height: `min(calc(100vh * 0.5), 700px)`,
                minHeight: "465px",
                columns: "6",
                phoneColumns: "12",
                right: CC_CELL_PADDING,
                bottom: CC_CELL_PADDING,
                child: {
                    type: FieldType.Component,
                    element: ({
                        position,
                        priceOpen,
                        priceTakeProfit,
                        priceStopLoss,
                        originalPriceOpen,
                        originalPriceTakeProfit,
                        originalPriceStopLoss,
                    }) => (
                        <Paper
                            sx={{
                                position: "relative",
                                height: "100%",
                                width: "100%",
                                overflow: "hidden",
                            }}
                        >
                            <Stack
                                sx={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    p: 3,
                                }}
                                direction="column"
                                spacing={2}
                            >
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        Price Levels
                                    </Typography>
                                    <Chip
                                        label={position === "long" ? "Long" : "Short"}
                                        size="small"
                                        sx={{
                                            background: position === "long" ? COLOR_GREEN : COLOR_RED,
                                            color: "#fff",
                                            fontWeight: 600,
                                        }}
                                    />
                                </Stack>
                                <Divider />
                                {[
                                    {
                                        label: "Entry",
                                        current: priceOpen,
                                        original: originalPriceOpen,
                                        color: COLOR_BLUE,
                                    },
                                    {
                                        label: "Take Profit",
                                        current: priceTakeProfit,
                                        original: originalPriceTakeProfit,
                                        color: COLOR_GREEN,
                                    },
                                    {
                                        label: "Stop Loss",
                                        current: priceStopLoss,
                                        original: originalPriceStopLoss,
                                        color: COLOR_RED,
                                    },
                                ].map(({ label, current, original }) => (
                                    <Stack key={label} direction="column" spacing={0.5}>
                                        <Typography variant="caption" sx={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: 1 }}>
                                            {label}
                                        </Typography>
                                        <Stack direction="row" alignItems="baseline" spacing={1.5}>
                                            <Typography variant="h6" fontWeight={700}>
                                                {current.toLocaleString()}
                                            </Typography>
                                            {current !== original && (
                                                <Typography variant="caption" sx={{ opacity: 0.45, textDecoration: "line-through" }}>
                                                    {original.toLocaleString()}
                                                </Typography>
                                            )}
                                        </Stack>
                                        <Divider />
                                    </Stack>
                                ))}
                            </Stack>
                        </Paper>
                    ),
                },
            },

            // Center-right: Partials list
            {
                type: FieldType.Hero,
                height: `min(calc(100vh * 0.5), 700px)`,
                minHeight: "465px",
                columns: "6",
                phoneColumns: "12",
                right: CC_CELL_PADDING,
                bottom: CC_CELL_PADDING,
                child: {
                    type: FieldType.Component,
                    element: ({ positionPartials }) => (
                        <Paper
                            sx={{
                                position: "relative",
                                height: "100%",
                                width: "100%",
                                overflow: "hidden",
                            }}
                        >
                            <Stack
                                sx={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    p: 3,
                                    overflowY: "auto",
                                }}
                                direction="column"
                                spacing={2}
                            >
                                <Typography variant="subtitle1" fontWeight={600}>
                                    Position Partials
                                </Typography>
                                <Divider />
                                {positionPartials.length === 0 ? (
                                    <Typography variant="body2" sx={{ opacity: 0.45 }}>
                                        No partials executed
                                    </Typography>
                                ) : (
                                    positionPartials.map((partial, idx) => (
                                        <Stack key={idx} direction="column" spacing={0.5}>
                                            <Stack direction="row" alignItems="center" justifyContent="space-between">
                                                <Chip
                                                    label={partial.type === "profit" ? "Profit" : "Loss"}
                                                    size="small"
                                                    sx={{
                                                        background: partial.type === "profit" ? COLOR_GREEN : COLOR_RED,
                                                        color: "#fff",
                                                        fontWeight: 600,
                                                    }}
                                                />
                                                <Typography variant="body2" sx={{ opacity: 0.6 }}>
                                                    #{idx + 1}
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" justifyContent="space-between">
                                                <Typography variant="caption" sx={{ opacity: 0.6 }}>
                                                    Close %
                                                </Typography>
                                                <Typography variant="body2" fontWeight={600}>
                                                    {partial.percent}%
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" justifyContent="space-between">
                                                <Typography variant="caption" sx={{ opacity: 0.6 }}>
                                                    Price at close
                                                </Typography>
                                                <Typography variant="body2" fontWeight={600}>
                                                    {partial.currentPrice.toLocaleString()}
                                                </Typography>
                                            </Stack>
                                            <Divider />
                                        </Stack>
                                    ))
                                )}
                            </Stack>
                        </Paper>
                    ),
                },
            },
        ],
    },

    // ── Row 3: DCA Levels (left) + 3 indicators (right) ───────────────
    {
        type: FieldType.Group,
        columns: "12",
        tabletColumns: "12",
        phoneColumns: "12",
        fields: [
            // Bottom-left: DCA levels list
            {
                type: FieldType.Hero,
                height: `min(calc(100vh * 0.5), 700px)`,
                minHeight: "465px",
                columns: "6",
                phoneColumns: "12",
                right: CC_CELL_PADDING,
                bottom: CC_CELL_PADDING,
                child: {
                    type: FieldType.Component,
                    element: ({ positionLevels }) => (
                        <Paper
                            sx={{
                                position: "relative",
                                height: "100%",
                                width: "100%",
                                overflow: "hidden",
                            }}
                        >
                            <Stack
                                sx={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    p: 3,
                                    overflowY: "auto",
                                }}
                                direction="column"
                                spacing={2}
                            >
                                <Typography variant="subtitle1" fontWeight={600}>
                                    DCA Levels
                                </Typography>
                                <Divider />
                                {positionLevels.map((price, idx) => (
                                    <Stack key={idx} direction="row" alignItems="center" justifyContent="space-between">
                                        <Stack direction="row" alignItems="center" spacing={1.5}>
                                            <Box
                                                sx={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: "50%",
                                                    background: COLOR_ORANGE,
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <Typography variant="caption" sx={{ opacity: 0.6 }}>
                                                Entry #{idx + 1}
                                            </Typography>
                                        </Stack>
                                        <Typography variant="body2" fontWeight={600}>
                                            {price.toLocaleString()}
                                        </Typography>
                                    </Stack>
                                ))}
                            </Stack>
                        </Paper>
                    ),
                },
            },

            // Bottom-right: 3 indicator widgets
            {
                type: FieldType.Group,
                columns: "6",
                phoneColumns: "12",
                fields: [
                    {
                        type: FieldType.Hero,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        right: CC_CELL_PADDING,
                        bottom: CC_CELL_PADDING,
                        height: `min(calc(100vh * 0.25), 350px)`,
                        minHeight: "calc(465px / 2)",
                        child: {
                            type: FieldType.Component,
                            element: ({ totalPartials }) => (
                                <IndicatorValueWidget
                                    color={COLOR_PURPLE}
                                    label="Planned Partials"
                                    value={totalPartials}
                                    icon={PieChart}
                                />
                            ),
                        },
                    },
                    {
                        type: FieldType.Hero,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        right: CC_CELL_PADDING,
                        bottom: CC_CELL_PADDING,
                        height: `min(calc(100vh * 0.25), 350px)`,
                        minHeight: "calc(465px / 2)",
                        child: {
                            type: FieldType.Component,
                            element: ({ partialExecuted }) => (
                                <IndicatorValueWidget
                                    color={COLOR_BLUE}
                                    label="Executed %"
                                    value={`${partialExecuted}%`}
                                    icon={DonutLarge}
                                />
                            ),
                        },
                    },
                    {
                        type: FieldType.Hero,
                        desktopColumns: "6",
                        tabletColumns: "6",
                        phoneColumns: "12",
                        right: CC_CELL_PADDING,
                        bottom: CC_CELL_PADDING,
                        height: `min(calc(100vh * 0.25), 350px)`,
                        minHeight: "calc(465px / 2)",
                        child: {
                            type: FieldType.Component,
                            element: ({ position }) => (
                                <IndicatorValueWidget
                                    color={position === "long" ? COLOR_GREEN : COLOR_RED}
                                    label="Position"
                                    value={position === "long" ? "Long" : "Short"}
                                    icon={position === "long" ? CallMade : CallReceived}
                                />
                            ),
                        },
                    },
                ],
            },
        ],
    },
];
