import * as React from "react";
import { useRef, useState, useLayoutEffect } from "react";
import { ICandleData } from "backtest-kit"
import {
  DeepPartial,
  ChartOptions,
  CrosshairMode,
  Time,
  LineStyle,
  SeriesMarker,
} from "lightweight-charts";
import { createChart } from "lightweight-charts";
import { makeStyles } from "../../../../styles";
import { dayjs, fromMomentStamp, getMomentStamp } from "react-declarative";

declare function parseFloat(value: unknown): number;

interface IChartProps {
  source: "1m" | "15m" | "1h";
  height: number;
  width: number;
  items: ICandleData[];
  currentPrice: number;
  percentToClose: number;
  createdAt: string;
}

const GREEN_COLOR = "#8BC34A";

const formatAmount = (value: number | string, scale = 2, separator = ",") => {
  const num = typeof value === "string" ? Number(value) : value;
  const str = num.toFixed(scale);
  const formatted =
    num < 10000 ? str : str.replace(/(\d)(?=(\d{3})+(\.|$))/g, `$1 `);
  return formatted.replace(/.00$/, "").replace(".", separator);
};

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

const MOMENT_STAMP_OFFSET = getMomentStamp(
  dayjs("2025-07-26T00:00:00Z"),
  "minute"
);

type Ref = React.MutableRefObject<HTMLDivElement>;

export const PartialProfitCommitChart = ({
  source,
  height,
  width,
  items,
  currentPrice,
  percentToClose,
  createdAt,
}: IChartProps) => {
  const { classes } = useStyles();
  const elementRef: Ref = useRef<HTMLDivElement>(undefined as never);
  const [tooltipDate, setTooltipDate] = useState<string | null>(null);

  useLayoutEffect(() => {
    const { current: chartElement } = elementRef;

    const candles = items
      .map(({ close, timestamp }, idx) => {
        let momentStamp: number;
        let time: Time;
        let date: dayjs.Dayjs;
        let formattedOriginalTime: string;

        if (timestamp && dayjs(timestamp).isValid()) {
          date = dayjs(timestamp);
          formattedOriginalTime = date.format("YYYY-MM-DD HH:mm:ss");
        } else {
          if (source === "1m") {
            momentStamp = MOMENT_STAMP_OFFSET + idx;
            date = fromMomentStamp(momentStamp, "minute");
          } else if (source === "15m") {
            momentStamp = MOMENT_STAMP_OFFSET + idx;
            date = fromMomentStamp(momentStamp, "minute");
            const minute = Math.floor(date.minute() / 15) * 15;
            date = date.startOf("hour").add(minute, "minute");
          } else if (source === "1h") {
            momentStamp = MOMENT_STAMP_OFFSET + Math.floor(idx / 60);
            date = fromMomentStamp(momentStamp, "hour");
            date = date.startOf("hour");
          }
          formattedOriginalTime = date.format("YYYY-MM-DD HH:mm:ss");
          console.warn(
            `Invalid timestamp at index ${idx}: ${timestamp}, using fromMomentStamp: ${formattedOriginalTime}`
          );
        }

        if (source === "1m") {
          momentStamp = getMomentStamp(date, "minute");
          time = momentStamp as Time;
        } else if (source === "15m") {
          const minute = Math.floor(date.minute() / 15) * 15;
          const alignedDate = date.startOf("hour").add(minute, "minute");
          momentStamp = getMomentStamp(alignedDate, "minute");
          time = momentStamp as Time;
        } else if (source === "1h") {
          const alignedDate = date.startOf("hour");
          momentStamp = getMomentStamp(alignedDate, "hour");
          time = momentStamp as Time;
        }

        if (!date.isValid()) {
          console.warn(
            `Invalid date at index ${idx}: momentStamp: ${momentStamp}`
          );
          return null;
        }

        console.debug(
          `Index: ${idx}, timestamp: ${timestamp}, momentStamp: ${momentStamp}, time: ${time}, date: ${date.format("YYYY-MM-DD HH:mm:ss")}`
        );

        return {
          time,
          originalTime: formattedOriginalTime,
          momentStamp,
          value: parseFloat(close),
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);

    if (candles.length === 0) {
      console.warn("No valid data points for chart");
      return;
    }

    const chart = createChart(chartElement, {
      ...chartOptions,
      width,
      height,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: source === "1m",
        tickMarkFormatter: (time: Time) => {
          const candle =
            candles.find((c) => c.momentStamp === Number(time)) || candles[0];
          if (!candle || !candle.originalTime) {
            return "Invalid date";
          }
          const date = dayjs(candle.originalTime);
          if (!date.isValid()) {
            return "Invalid date";
          }
          if (source === "1m") {
            return date.format("HH:mm:ss");
          } else if (source === "15m") {
            return date.format("HH:mm");
          } else {
            return date.format("DD/MM HH:mm");
          }
        },
      },
    });

    const lineSeries = chart.addLineSeries({
      lastValueVisible: false,
      color: GREEN_COLOR,
    });

    lineSeries.setData(candles);

    lineSeries.createPriceLine({
      price: currentPrice,
      color: GREEN_COLOR,
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: `Partial Profit Committed (${percentToClose.toFixed(2)}%)`,
    });

    const markers: SeriesMarker<Time>[] = [];

    const commitDate = dayjs(createdAt);
    if (commitDate.isValid()) {
      let commitTime: Time;
      if (source === "1m") {
        commitTime = getMomentStamp(commitDate, "minute") as Time;
      } else if (source === "15m") {
        const minute = Math.floor(commitDate.minute() / 15) * 15;
        const alignedDate = commitDate.startOf("hour").add(minute, "minute");
        commitTime = getMomentStamp(alignedDate, "minute") as Time;
      } else {
        const alignedDate = commitDate.startOf("hour");
        commitTime = getMomentStamp(alignedDate, "hour") as Time;
      }

      markers.push({
        time: commitTime,
        position: "aboveBar",
        color: GREEN_COLOR,
        shape: "circle",
        size: 1,
        text: "Committed",
      });
    }

    markers.sort((a, b) => Number(a.time) - Number(b.time));
    lineSeries.setMarkers(markers);

    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const data = candles.find((d) => d.momentStamp === Number(param.time));
        if (data) {
          const dateFormat =
            source === "1m" ? "DD/MM/YYYY HH:mm:ss" : "DD/MM/YYYY HH:mm";
          const dateTime = dayjs(data.originalTime).format(dateFormat);
          const price = formatAmount(data.value.toFixed(6));
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
  }, [source, height, width, items, currentPrice, percentToClose, createdAt]);

  return (
    <div ref={elementRef} className={classes.root}>
      {tooltipDate && <div className={classes.tooltip}>{tooltipDate}</div>}
    </div>
  );
};

export default PartialProfitCommitChart;
