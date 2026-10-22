import * as React from "react";
import { useRef, useLayoutEffect } from "react";

import {
    DeepPartial,
    ChartOptions,
    LineStyleOptions,
    SeriesOptionsCommon,
    MouseEventParams,
    UTCTimestamp,
    Time,
} from "lightweight-charts";

import { createChart } from "lightweight-charts";

import { AutoSizer, dayjs, formatAmount } from "react-declarative";

import { makeStyles } from "../../../styles";
import { IBalancePoint } from "../../../model/Budget.model";
import { t } from "../../../i18n";

interface IChartProps {
    height: number;
    width: number;
    items: IBalancePoint[];
}

const useStyles = makeStyles()({
    root: {
        position: "relative",
    },
    tooltip: {
        position: "absolute",
        color: "gray",
        margin: 0,
        left: 5,
        top: 5,
        zIndex: 1,
        pointerEvents: "none",
    },
});

const chartOptions: DeepPartial<ChartOptions> = {
    layout: {
        textColor: "#d1d4dc",
        backgroundColor: "#0000",
    },
    rightPriceScale: {
        scaleMargins: {
            top: 0.3,
            bottom: 0.25,
        },
    },
    crosshair: {
        vertLine: {
            width: 4,
            color: "#ebe0e301",
            style: 0,
        },
        horzLine: {
            visible: false,
            labelVisible: false,
        },
    },
    grid: {
        vertLines: {
            color: "#f8b3",
        },
        horzLines: {
            color: "#f8b3",
        },
    },
    handleScroll: {
        vertTouchDrag: false,
    },
};

type Ref = React.MutableRefObject<HTMLDivElement>;

const capitalSeriesOptions: DeepPartial<LineStyleOptions & SeriesOptionsCommon> = {
    color: "#90cbfa",
    lineWidth: 2,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
};

const grossSeriesOptions: DeepPartial<LineStyleOptions & SeriesOptionsCommon> = {
    color: "#2EA96F",
    lineWidth: 2,
    lineStyle: 2,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
};

/** Journal timestamps are milliseconds; the chart wants seconds. Labels are formatted back through dayjs in local time */
const TO_CHART_TIME_FN = (timestamp: number): UTCTimestamp => Math.floor(timestamp / 1000) as UTCTimestamp;

const Chart = ({ height, width, items }: IChartProps) => {
    const { classes } = useStyles();

    const elementRef: Ref = useRef<HTMLDivElement>(undefined as never);
    const tooltipRef: Ref = useRef<HTMLDivElement>(undefined as never);

    useLayoutEffect(() => {
        const { current: chartElement } = elementRef;
        const { current: tooltipElement } = tooltipRef;

        const chart = createChart(chartElement, {
            ...chartOptions,
            height,
            width,
            localization: {
                priceFormatter: (price: number) => formatAmount(price),
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                tickMarkFormatter: (time: Time) => {
                    const date = dayjs(Number(time) * 1000);
                    if (!date.isValid()) {
                        return t("Invalid date");
                    }
                    return date.format("DD.MM HH:mm");
                },
            },
        });

        const capitalSeries = chart.addLineSeries({
            ...capitalSeriesOptions,
        });

        const grossSeries = chart.addLineSeries({
            ...grossSeriesOptions,
        });

        capitalSeries.setData(
            items.map(({ timestamp, capital }) => ({
                time: TO_CHART_TIME_FN(timestamp),
                value: capital,
            })),
        );

        grossSeries.setData(
            items.map(({ timestamp, gross }) => ({
                time: TO_CHART_TIME_FN(timestamp),
                value: gross,
            })),
        );

        const crosshairMoveHandler = ({ time }: MouseEventParams) => {
            if (!time) {
                tooltipElement.innerHTML = "";
                return;
            }
            try {
                const seconds = Number(time);
                const item = items.find(({ timestamp }) => TO_CHART_TIME_FN(timestamp) === seconds);
                if (item) {
                    const date = dayjs(item.timestamp).format("DD/MM/YYYY HH:mm");
                    tooltipElement.innerHTML = [
                        date,
                        `${t("Capital")}: ${formatAmount(item.capital)}`,
                        `${t("Gross")}: ${formatAmount(item.gross)}`,
                        `${t("Free")}: ${formatAmount(item.free)}`,
                    ].join(", ");
                } else {
                    tooltipElement.innerHTML = "";
                }
            } catch (error) {
                console.log(error);
                tooltipElement.innerHTML = "";
            }
        };

        chart.timeScale().fitContent();

        chart.subscribeCrosshairMove(crosshairMoveHandler);

        return () => {
            chart.unsubscribeCrosshairMove(crosshairMoveHandler);
            chart.remove();
        };
    }, [height, width, items]);

    return (
        <div ref={elementRef} className={classes.root}>
            <p ref={tooltipRef} className={classes.tooltip} />
        </div>
    );
};

interface IBalanceChartProps {
    items: IBalancePoint[];
}

export const BalanceChart = ({ items }: IBalanceChartProps) => (
    <AutoSizer>
        {({ height, width }) => (
            <Chart height={height} width={width} items={items} />
        )}
    </AutoSizer>
);

export default BalanceChart;
