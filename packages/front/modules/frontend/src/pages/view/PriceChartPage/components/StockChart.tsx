import * as React from "react";
import { useRef, useLayoutEffect, useState } from "react";
import { ICandleData } from "backtest-kit";

import {
    DeepPartial,
    ChartOptions,
    CrosshairMode,
    Time,
    LineStyle,
} from "lightweight-charts";

import { createChart } from "lightweight-charts";
import { makeStyles } from "../../../../styles";
import { colors } from "@mui/material";
import { dayjs, formatAmount } from "react-declarative";

declare function parseFloat(value: unknown): number;

interface IChartProps {
    height: number;
    width: number;
    items: ICandleData[];
    position: "long" | "short" | null;
    priceOpen: number;
    priceStopLoss: number;
    priceTakeProfit: number;
}

const useStyles = makeStyles()({
    root: {
        position: "relative",
    },
    tooltip: {
        position: "absolute",
        margin: 0,
        left: 5,
        top: 5,
        backgroundColor: "#343434",
        zIndex: 999,
        color: "white",
        fontWeight: "bold",
        padding: "5px 10px",
        borderRadius: 3,
        fontSize: "12px",
        pointerEvents: "none",
        touchAction: "none",
    },
});

const chartOptions: DeepPartial<ChartOptions> = {
    layout: {
        textColor: "#d4d4d8",
        backgroundColor: "#ffffff",
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

export const StockChart = ({ height, width, items, position, priceOpen, priceStopLoss, priceTakeProfit }: IChartProps) => {
    const { classes } = useStyles();
    const elementRef: Ref = useRef<HTMLDivElement>(undefined as never);
    const [tooltipDate, setTooltipDate] = useState<string | null>(null);

    useLayoutEffect(() => {
        const { current: chartElement } = elementRef;

        const chart = createChart(chartElement, {
            ...chartOptions,
            width,
            height,
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { labelVisible: false },
                horzLine: { visible: false, labelVisible: true },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
                tickMarkFormatter: (time: Time) => {
                    const candle =
                        items.find((c) => c.timestamp === Number(time)) ||
                        items[0];
                    if (!candle || !candle.timestamp) {
                        return "Invalid date";
                    }
                    const date = dayjs(candle.timestamp);
                    if (!date.isValid()) {
                        return "Invalid date";
                    }
                    return date.format("HH:mm:ss");
                },
            },
        });

        const series = chart.addLineSeries({
            lastValueVisible: false,
            color: colors.blue[400],
        });

        const data = items.map((c) => ({
            time: Math.floor(c.timestamp) as Time,
            value: parseFloat(c.close),
        }));

        series.setData(data);

        if (position && priceOpen) {
            const entryColor = position === "long" ? colors.blue[700] : colors.orange[700];
            series.createPriceLine({
                price: priceOpen,
                color: entryColor,
                lineWidth: 2,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: true,
                title: position === "long" ? "LONG Entry" : "SHORT Entry",
            });
        }

        if (priceStopLoss) {
            series.createPriceLine({
                price: priceStopLoss,
                color: colors.red[500],
                lineWidth: 2,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: true,
                title: "SL",
            });
        }

        if (priceTakeProfit) {
            series.createPriceLine({
                price: priceTakeProfit,
                color: colors.green[500],
                lineWidth: 2,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: true,
                title: "TP",
            });
        }

        chart.subscribeCrosshairMove((param) => {
            if (param.time) {
                const candle = items.find(
                    (d) => d.timestamp === Number(param.time),
                );
                if (candle) {
                    const dateTime = dayjs(candle.timestamp).format(
                        "DD/MM/YYYY HH:mm:ss",
                    );
                    const price = formatAmount(candle.close.toFixed(6));
                    setTooltipDate(`${dateTime}: ${price}`);
                } else {
                    setTooltipDate(null);
                }
            } else {
                setTooltipDate(null);
            }
        });

        chart.timeScale().fitContent();

        return () => {
            chart.remove();
        };
    }, [height, width, items]);

    return (
        <div ref={elementRef} className={classes.root}>
            {tooltipDate && (
                <div className={classes.tooltip}>{tooltipDate}</div>
            )}
        </div>
    );
};

export default StockChart;
