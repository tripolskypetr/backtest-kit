import { TypedField, FieldType } from "react-declarative";

import { AccessTime } from "@mui/icons-material";
import { AssignmentLate } from "@mui/icons-material";
import { DirectionsRun } from "@mui/icons-material";
import { HighlightOff } from "@mui/icons-material";
import { MarkChatUnread } from "@mui/icons-material";
import { PointOfSale } from "@mui/icons-material";
import { Work } from "@mui/icons-material";
import IndicatorValueWidget from "../widgets/IndicatorValueWidget";

const CC_CELL_PADDING = "7px";

export const status_fields: TypedField[] = [
    {
        type: FieldType.Group,
        columns: "14",
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
                    element: ({ indicatorValues }) => (
                        <IndicatorValueWidget
                            color="#4FC0E8"
                            label="New chats"
                            value={indicatorValues.newChats}
                            icon={MarkChatUnread}
                        />
                    ),
                },
            },
            {
                type: FieldType.Hero,
                minHeight: "185px",
                columns: "3",
                tabletColumns: "6",
                phoneColumns: "12",

                right: CC_CELL_PADDING,
                bottom: CC_CELL_PADDING,

                height: `max(calc(100vh * 0.2), 150px)`,

                child: {
                    type: FieldType.Component,
                    element: ({ indicatorValues }) => (
                        <IndicatorValueWidget
                            color="#fc6e51"
                            label="New sales"
                            value={indicatorValues.newSales}
                            icon={PointOfSale}
                        />
                    ),
                },
            },
            {
                type: FieldType.Hero,
                minHeight: "185px",
                columns: "3",
                tabletColumns: "6",
                phoneColumns: "12",

                height: `max(calc(100vh * 0.2), 150px)`,

                bottom: CC_CELL_PADDING,
                right: CC_CELL_PADDING,
                child: {
                    type: FieldType.Component,
                    element: ({ indicatorValues }) => (
                        <IndicatorValueWidget
                            color="#7FB537"
                            label="Hours worked"
                            value={indicatorValues.hoursWorked}
                            icon={Work}
                        />
                    ),
                },
            },
            {
                type: FieldType.Hero,
                minHeight: "185px",
                columns: "3",
                tabletColumns: "6",
                phoneColumns: "12",

                bottom: CC_CELL_PADDING,
                right: CC_CELL_PADDING,
                height: `max(calc(100vh * 0.2), 150px)`,

                child: {
                    type: FieldType.Component,
                    element: ({ indicatorValues }) => (
                        <IndicatorValueWidget
                            color="#FE9B31"
                            label="Late arrivals"
                            value={indicatorValues.lateArrivals}
                            icon={AssignmentLate}
                        />
                    ),
                },
            },
        ],
    },
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
                right: CC_CELL_PADDING,
                bottom: CC_CELL_PADDING,
                columns: "6",
                phoneColumns: "12",

                child: {
                    type: FieldType.Component,
                    element: ({ indicatorValues }) => (
                        <IndicatorValueWidget
                            color="#ffce54"
                            label="Absence hours"
                            value={indicatorValues.abscenceHours}
                            icon={DirectionsRun}
                        />
                    ),
                },
            },
            {
                type: FieldType.Hero,
                columns: "6",
                phoneColumns: "12",
                right: CC_CELL_PADDING,
                bottom: CC_CELL_PADDING,
                height: `min(calc(100vh * 0.5), 700px)`,
                minHeight: "465px",
                child: {
                    type: FieldType.Component,
                    element: ({ indicatorValues }) => (
                        <IndicatorValueWidget
                            color="#967adc"
                            label="Overtime"
                            value={indicatorValues.overtime}
                            icon={AccessTime}
                        />
                    ),
                },
            },
        ],
    },

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
                    element: ({ indicatorValues }) => (
                        <IndicatorValueWidget
                            color="#da4453"
                            label="Downtime"
                            value={indicatorValues.downTime}
                            icon={HighlightOff}
                        />
                    ),
                },
            },
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
                            element: ({ indicatorValues }) => (
                                <IndicatorValueWidget
                                    color="#da4453"
                                    label="Downtime"
                                    value={indicatorValues.downTime}
                                    icon={HighlightOff}
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
                            element: ({ indicatorValues }) => (
                                <IndicatorValueWidget
                                    color="#da4453"
                                    label="Downtime"
                                    value={indicatorValues.downTime}
                                    icon={HighlightOff}
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
                            element: ({ indicatorValues }) => (
                                <IndicatorValueWidget
                                    color="#da4453"
                                    label="Downtime"
                                    value={indicatorValues.downTime}
                                    icon={HighlightOff}
                                />
                            ),
                        },
                    },
                ],
            },
        ],
    },
];
