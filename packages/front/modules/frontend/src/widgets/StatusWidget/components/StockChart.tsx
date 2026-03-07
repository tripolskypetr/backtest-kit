import * as React from "react";
import { useRef, useLayoutEffect, useState } from "react";
import { ICandleData } from "backtest-kit";

import {
  DeepPartial,
  ChartOptions,
  LineStyleOptions,
  SeriesOptionsCommon,
  UTCTimestamp,
  LineStyle,
  Time,
} from "lightweight-charts";

import { createChart } from "lightweight-charts";
import { makeStyles } from "../../../styles";
import { colors } from "@mui/material";
import { dayjs, formatAmount } from "react-declarative";

declare function parseFloat(value: unknown): number;

const MS_PER_MINUTE = 60_000;

const alignToInterval = (
  timestamp: number,
): number => {
  return Math.floor(timestamp / MS_PER_MINUTE) * MS_PER_MINUTE;
};


interface IChartProps {
  height: number;
  width: number;
  items: ICandleData[];
  position: "long" | "short";
  pendingAt: number;
  priceOpen: number;
  priceStopLoss: number;
  priceTakeProfit: number;
  originalPriceOpen: number;
  originalPriceStopLoss: number;
  originalPriceTakeProfit: number;
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

const seriesOptions: DeepPartial<LineStyleOptions & SeriesOptionsCommon> = {
  lineWidth: 2,
  crosshairMarkerVisible: false,
  lastValueVisible: false,
  priceLineVisible: false,
};

type Ref = React.MutableRefObject<HTMLDivElement>;

export const StockChart = ({
  height,
  width,
  items,
  position,
  pendingAt,
  priceOpen,
  priceStopLoss,
  priceTakeProfit,
  originalPriceOpen,
  originalPriceStopLoss,
  originalPriceTakeProfit,
}: IChartProps) => {
  const { classes } = useStyles();
  const elementRef: Ref = useRef<HTMLDivElement>(undefined as never);
  const [tooltipDate, setTooltipDate] = useState<string | null>(null);


  useLayoutEffect(() => {
    const { current: chartElement } = elementRef;

    const chart = createChart(chartElement, {
      ...chartOptions,
      height,
      width,
    });

    const series = chart.addLineSeries({
      ...seriesOptions,
      color: position === "long" ? colors.blue[400] : colors.orange[400],
    });

    const data = items
      .filter((c) => c.timestamp != null)
      .map((c) => ({
        time: Math.floor(c.timestamp) as Time,
        value: parseFloat(c.close),
      }));

    series.setData(data);

    const positionLabel = position === "long" ? "LONG" : "SHORT";
    const positionColor = position === "long" ? colors.blue[700] : colors.orange[700];

    // Original Entry (dashed) — только если DCA сдвинул цену
    if (originalPriceOpen !== priceOpen) {
      series.createPriceLine({
        price: originalPriceOpen,
        color: positionColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `${positionLabel} Original Entry`,
      });
    }

    // Current Entry (solid)
    series.createPriceLine({
      price: priceOpen,
      color: positionColor,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `${positionLabel} Entry`,
    });

    // Original SL (dashed)
    if (originalPriceStopLoss !== priceStopLoss) {
      series.createPriceLine({
        price: originalPriceStopLoss,
        color: colors.red[500],
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Original SL",
      });
    }

    // Current SL (solid)
    series.createPriceLine({
      price: priceStopLoss,
      color: colors.red[500],
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "SL",
    });

    // Original TP (dashed)
    if (originalPriceTakeProfit !== priceTakeProfit) {
      series.createPriceLine({
        price: originalPriceTakeProfit,
        color: colors.green[500],
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Original TP",
      });
    }

    // Current TP (solid)
    series.createPriceLine({
      price: priceTakeProfit,
      color: colors.green[500],
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "TP",
    });

    // Entry marker
    if (pendingAt) {
      const entryTime = pendingAt as UTCTimestamp;
      series.setMarkers([
        {
          time: alignToInterval(entryTime) as Time,
          position: position === "short" ? "aboveBar" : "belowBar",
          color: positionColor,
          shape: position === "short" ? "arrowDown" : "arrowUp",
          size: 1,
          text: "Entry",
        },
      ]);
    }

    
    chart.subscribeCrosshairMove((param) => {
      console.log(param.time)
      if (param.time) {
        const data = items.find((d) => d.timestamp === Number(param.time));
        if (data) {
          const dateTime = dayjs(data.timestamp).format("DD/MM/YYYY HH:mm:ss");
          const price = formatAmount(data.close.toFixed(6));
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
  }, [height, width, items, position, pendingAt, priceOpen, priceStopLoss, priceTakeProfit, originalPriceOpen, originalPriceStopLoss, originalPriceTakeProfit]);

  return (
    <div ref={elementRef} className={classes.root}>
      {tooltipDate && <div className={classes.tooltip}>{tooltipDate}</div>}
    </div>
  );
};

export default StockChart;
