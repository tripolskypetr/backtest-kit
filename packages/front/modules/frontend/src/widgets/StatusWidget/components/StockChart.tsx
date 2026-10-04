import * as React from "react";
import { useRef, useLayoutEffect, useState } from "react";
import { ICandleData } from "backtest-kit";

import {
    DeepPartial,
    ChartOptions,
    LineStyleOptions,
    SeriesOptionsCommon,
    SeriesMarker,
    LineStyle,
    Time,
    CrosshairMode,
} from "lightweight-charts";

import { createChart } from "lightweight-charts";
import { makeStyles } from "../../../styles";
import { colors } from "@mui/material";
import { dayjs, formatAmount, getMomentStamp } from "react-declarative";
import getPriceScale from "../../../utils/getPriceScale";
import { t } from "../../../i18n";
import { Timeframe } from "../model/Timeframe.model";

declare function parseFloat(value: unknown): number;

/**
 * lightweight-charts hack: candle times are fed as momentStamp (minutes or
 * hours since the dayjs epoch) aligned to the timeframe, so 15m/1h series
 * keep even spacing. Labels are restored from the original timestamp
 */
const getAlignedMomentStamp = (
    date: dayjs.Dayjs,
    timeframe: Timeframe,
): number => {
    if (timeframe === "15m") {
        const minute = Math.floor(date.minute() / 15) * 15;
        return getMomentStamp(
            date.startOf("hour").add(minute, "minute"),
            "minute",
        );
    }
    if (timeframe === "1h") {
        return getMomentStamp(date.startOf("hour"), "hour");
    }
    return getMomentStamp(date, "minute");
};

type PositionPartial = {
    type: "profit" | "loss";
    percent: number;
    currentPrice: number;
    timestamp: number;
};

type PositionEntry = {
    price: number;
    cost: number;
    timestamp: number
}

interface IChartProps {
    height: number;
    width: number;
    items: ICandleData[];
    timeframe: Timeframe;
    position: "long" | "short";
    status?: string;
    pendingAt: number;
    updatedAt: number;
    priceOpen: number;
    timestamp: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    originalPriceOpen: number;
    originalPriceStopLoss: number;
    originalPriceTakeProfit: number;
    minuteEstimatedTime: number;
    positionPartials: PositionPartial[];
    positionEntries: PositionEntry[];
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

export const StockChart = ({
    height,
    width,
    items,
    timeframe,
    position,
    status,
    pendingAt,
    updatedAt,
    priceOpen,
    priceStopLoss,
    priceTakeProfit,
    originalPriceOpen,
    originalPriceStopLoss,
    originalPriceTakeProfit,
    minuteEstimatedTime,
    timestamp,
    positionEntries,
    positionPartials,
}: IChartProps) => {
    const { classes } = useStyles();
    const elementRef: Ref = useRef<HTMLDivElement>(undefined as never);
    const [tooltipDate, setTooltipDate] = useState<string | null>(null);

    useLayoutEffect(() => {
        const { current: chartElement } = elementRef;

        const exitAt = updatedAt;
        const visibleItems = items.filter(
            (c) => c.timestamp >= pendingAt && c.timestamp <= exitAt,
        );

        const candles = visibleItems
            .map(({ close, timestamp }, idx) => {
                const date = dayjs(timestamp);
                if (!date.isValid()) {
                    console.warn(
                        `Invalid timestamp at index ${idx}: ${timestamp}`,
                    );
                    return null;
                }
                const momentStamp = getAlignedMomentStamp(date, timeframe);
                return {
                    time: momentStamp as Time,
                    originalTime: timestamp,
                    momentStamp,
                    value: parseFloat(close),
                };
            })
            .filter((item): item is NonNullable<typeof item> => !!item);

        // Markers only render on an existing bar: snap the aligned stamp to
        // the nearest candle at or after it (filtering can drop the exact bar)
        const snapToCandle = (stamp: number): Time | null => {
            const candle =
                candles.find((c) => c.momentStamp >= stamp) ||
                candles[candles.length - 1];
            return candle ? (candle.momentStamp as Time) : null;
        };

        const chart = createChart(chartElement, {
            ...chartOptions,
            localization: {
                priceFormatter: (price: number) => formatAmount(price, getPriceScale(price)),
            },
            width,
            height,
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { labelVisible: false },
                horzLine: { visible: false, labelVisible: true },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: timeframe === "1m",
                tickMarkFormatter: (time: Time) => {
                    // Поиск свечи по momentStamp
                    const candle =
                        candles.find((c) => c.momentStamp === Number(time)) ||
                        candles[0];
                    if (!candle || !candle.originalTime) {
                        return t("Invalid date");
                    }
                    const date = dayjs(candle.originalTime);
                    if (!date.isValid()) {
                        return t("Invalid date");
                    }
                    if (timeframe === "1m") {
                        return date.format("HH:mm:ss");
                    }
                    if (timeframe === "15m") {
                        return date.format("HH:mm");
                    }
                    return date.format("DD/MM HH:mm");
                },
            },
        });

        const series = chart.addLineSeries({
            lastValueVisible: false,
            color: colors.blue[400],
        });

        series.setData(candles);

        const positionLabel = position === "long" ? "LONG" : "SHORT";
        const positionColor = colors.blue[700];

        // Original Entry (dashed) — только если DCA сдвинул цену
        if (Number(originalPriceOpen).toFixed(6) !== Number(priceOpen).toFixed(6)) {
            series.createPriceLine({
                price: originalPriceOpen,
                color: positionColor,
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: `${positionLabel} ${t("Original Entry")}`,
            });
        }

        // Current Entry (solid)
        series.createPriceLine({
            price: priceOpen,
            color: positionColor,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `${positionLabel} ${t("Entry")}`,
        });

        // Original SL (dashed)
        if (Number(originalPriceStopLoss).toFixed(6) !== Number(priceStopLoss).toFixed(6)) {
            series.createPriceLine({
                price: originalPriceStopLoss,
                color: colors.red[500],
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: t("Original SL"),
            });
        }

        // Current SL (solid)
        series.createPriceLine({
            price: priceStopLoss,
            color: colors.red[500],
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: t("SL"),
        });

        // Original TP (dashed)
        if (Number(originalPriceTakeProfit).toFixed(6) !== Number(priceTakeProfit).toFixed(6)) {
            series.createPriceLine({
                price: originalPriceTakeProfit,
                color: colors.green[500],
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: t("Original TP"),
            });
        }

        // Current TP (solid)
        series.createPriceLine({
            price: priceTakeProfit,
            color: colors.green[500],
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: t("TP"),
        });

        const markers: SeriesMarker<Time>[] = [];

        const toMarkerTime = (ts: number): Time | null =>
            snapToCandle(getAlignedMomentStamp(dayjs(ts), timeframe));

        if (pendingAt) {
            const entryTime = toMarkerTime(pendingAt);
            if (entryTime !== null) {
                markers.push({
                    time: entryTime,
                    position: position === "short" ? "aboveBar" : "belowBar",
                    color: positionColor,
                    shape: position === "short" ? "arrowDown" : "arrowUp",
                    size: 1,
                    text: t("Entry"),
                });
            }

            const exitTime = toMarkerTime(exitAt);
            if (status === "closed" && exitTime !== null) {
                markers.push({
                    time: exitTime,
                    position: position === "short" ? "belowBar" : "aboveBar",
                    color: positionColor,
                    shape: position === "short" ? "arrowUp" : "arrowDown",
                    size: 1,
                    text: t("Exit"),
                });
            }
        }

        const entryIndex = visibleItems.findIndex(({ timestamp }) => timestamp > pendingAt);
        const startIndex = entryIndex === -1 ? 0 : entryIndex;

        for (const [idx, entry] of positionEntries.entries()) {
            if (idx === 0) {
                continue;
            }
            const entryTime = toMarkerTime(entry.timestamp);
            if (entryTime === null) {
                continue;
            }
            markers.push({
                time: entryTime,
                position: "belowBar",
                color: colors.amber[400],
                shape: "circle",
                size: 1,
                text: `${t("DCA")} ${idx}`,
            });
        }

        for (const partial of positionPartials) {
            const isProfit = partial.type === "profit";
            const partialTime = toMarkerTime(partial.timestamp);
            if (partialTime === null) {
                continue;
            }
            markers.push({
                time: partialTime,
                position: isProfit ? "aboveBar" : "belowBar",
                color: isProfit ? colors.green[400] : colors.red[400],
                shape: "square",
                size: 1,
                text: `${isProfit ? t("PP") : t("PL")} ${partial.percent}%`,
            });
        }

        markers.sort((a, b) => Number(a.time) - Number(b.time));
        series.setMarkers(markers);

        chart.subscribeCrosshairMove((param) => {
            if (param.time) {
                const data = candles.find(
                    (d) => d.momentStamp === Number(param.time),
                );
                if (data) {
                    const dateFormat =
                        timeframe === "1m"
                            ? "DD/MM/YYYY HH:mm:ss"
                            : "DD/MM/YYYY HH:mm";
                    const dateTime = dayjs(data.originalTime).format(
                        dateFormat,
                    );
                    const price = formatAmount(
                        data.value,
                        getPriceScale(data.value),
                    );
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
    }, [
        height,
        width,
        items,
        timeframe,
        position,
        status,
        pendingAt,
        updatedAt,
        timestamp,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
        originalPriceOpen,
        originalPriceStopLoss,
        originalPriceTakeProfit,
        minuteEstimatedTime,
        positionEntries,
        positionPartials,
    ]);

    return (
        <div ref={elementRef} className={classes.root}>
            {tooltipDate && (
                <div className={classes.tooltip}>{tooltipDate}</div>
            )}
        </div>
    );
};

export default StockChart;
