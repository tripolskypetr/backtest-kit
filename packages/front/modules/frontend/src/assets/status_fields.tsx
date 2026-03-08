import { TypedField, FieldType } from "react-declarative";

import {
    AccountBalanceTwoTone as AccountBalance,
    AnalyticsTwoTone as Analytics,
    DonutSmallTwoTone as DonutSmall,
    RequestQuoteTwoTone as RequestQuote,
    LayersTwoTone as Layers,
} from "@mui/icons-material";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import IndicatorValueWidget from "../widgets/IndicatorValueWidget";
import StatusWidget from "../widgets/StatusWidget";
import AveragingWidget from "../widgets/AveragingWidget";
import PartialWidget from "../widgets/PartialWidget";

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
                    element: ({ pnlPercentage, payload }) => (
                        <IndicatorValueWidget
                            outlinePaper={payload.outlinePaper}
                            color={pnlColor(pnlPercentage)}
                            label="PNL %"
                            value={`${pnlPercentage >= 0 ? "+" : ""}${pnlPercentage.toFixed(2)}%`}
                            icon={Analytics}
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
                    element: ({ pnlCost, payload }) => (
                        <IndicatorValueWidget
                            outlinePaper={payload.outlinePaper}
                            color={pnlColor(pnlCost)}
                            label="PNL $"
                            value={`${pnlCost >= 0 ? "+" : ""}$${Math.abs(pnlCost).toFixed(2)}`}
                            icon={Analytics}
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
                    element: ({ pnlEntries, payload }) => (
                        <IndicatorValueWidget
                            outlinePaper={payload.outlinePaper}
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
                    element: ({ totalEntries, payload }) => (
                        <IndicatorValueWidget
                            outlinePaper={payload.outlinePaper}
                            color={COLOR_ORANGE}
                            label="Total Entries"
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
                    element: (data) => (
                        <StatusWidget
                            data={data}
                            outlinePaper={data.payload.outlinePaper}
                            sx={{ height: "100%", width: "100%" }}
                        />
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
                    element: (data) => (
                        <AveragingWidget
                            outlinePaper={data.payload.outlinePaper}
                            data={data}
                            sx={{ height: "100%", width: "100%" }}
                        />
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
                    element: (data) => (
                        <PartialWidget
                            data={data}
                            outlinePaper={data.payload.outlinePaper}
                            sx={{ height: "100%", width: "100%" }}
                        />
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
                            element: ({
                                totalPartials,
                                pnlPercentage,
                                payload,
                            }) => (
                                <IndicatorValueWidget
                                    color={
                                        totalPartials > 0
                                            ? pnlColor(pnlPercentage)
                                            : COLOR_PURPLE
                                    }
                                    outlinePaper={payload.outlinePaper}
                                    label="Total Closes"
                                    value={totalPartials}
                                    icon={DonutSmall}
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
                            element: ({
                                partialExecuted,
                                pnlPercentage,
                                payload,
                            }) => (
                                <IndicatorValueWidget
                                    color={
                                        partialExecuted > 0
                                            ? pnlColor(pnlPercentage)
                                            : COLOR_BLUE
                                    }
                                    outlinePaper={payload.outlinePaper}
                                    label="Total Closed %"
                                    value={`${partialExecuted}%`}
                                    icon={DonutSmall}
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
                            element: ({
                                priceOpen,
                                pnlPercentage,
                                payload,
                            }) => (
                                <IndicatorValueWidget
                                    color={pnlColor(pnlPercentage)}
                                    outlinePaper={payload.outlinePaper}
                                    label="Average Price"
                                    value={priceOpen.toLocaleString()}
                                    icon={RequestQuote}
                                />
                            ),
                        },
                    },
                ],
            },
        ],
    },
];

export default status_fields;
