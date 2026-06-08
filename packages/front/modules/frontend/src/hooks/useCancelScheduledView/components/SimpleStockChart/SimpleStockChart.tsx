import * as React from "react";
import { useRef, useState, useLayoutEffect } from "react";
import { ICandleData } from "backtest-kit";
import {
  DeepPartial,
  ChartOptions,
  CrosshairMode,
  Time,
  IChartApi,
  ISeriesApi,
} from "lightweight-charts";
import { createChart } from "lightweight-charts";
import getPriceScale from "../../../../utils/getPriceScale";
import { makeStyles } from "../../../../styles";
import { dayjs, fromMomentStamp, getMomentStamp } from "react-declarative";
import { colors } from "@mui/material";

declare function parseFloat(value: unknown): number;

interface IVertLineOptions {
  showLabel?: boolean;
  labelText?: string;
  color?: string;
  width?: number;
}

class VertLine {
  private _chart: IChartApi;
  private _time: Time;
  private _options: Required<IVertLineOptions>;
  private _div: HTMLDivElement | null = null;

  constructor(
    chart: IChartApi,
    _series: ISeriesApi<"Line">,
    time: Time,
    options: IVertLineOptions = {}
  ) {
    this._chart = chart;
    this._time = time;
    this._options = {
      showLabel: options.showLabel ?? true,
      labelText: options.labelText ?? "",
      color: options.color ?? "blue",
      width: options.width ?? 2,
    };
    this._createDiv();
    this._updatePosition();
    this._chart.timeScale().subscribeVisibleTimeRangeChange(() => this._updatePosition());
  }

  private _createDiv() {
    const chartElement = (this._chart as unknown as { _container?: HTMLElement })._container
      ?? document.querySelector(".tv-lightweight-charts");
    if (!chartElement) return;

    const container = chartElement.parentElement;
    if (!container) return;

    this._div = document.createElement("div");
    this._div.style.position = "absolute";
    this._div.style.zIndex = "10";
    this._div.style.pointerEvents = "none";
    this._div.style.width = `${this._options.width}px`;
    this._div.style.backgroundColor = this._options.color;
    this._div.style.top = "0";
    this._div.style.bottom = "0";

    if (this._options.showLabel && this._options.labelText) {
      const label = document.createElement("div");
      label.textContent = this._options.labelText;
      label.style.position = "absolute";
      label.style.top = "5px";
      label.style.left = "5px";
      label.style.backgroundColor = this._options.color;
      label.style.color = "white";
      label.style.padding = "2px 6px";
      label.style.borderRadius = "3px";
      label.style.fontSize = "11px";
      label.style.fontWeight = "bold";
      label.style.whiteSpace = "nowrap";
      this._div.appendChild(label);
    }

    container.style.position = "relative";
    container.appendChild(this._div);
  }

  private _updatePosition() {
    if (!this._div) return;
    const x = this._chart.timeScale().timeToCoordinate(this._time);
    if (x === null) {
      this._div.style.display = "none";
    } else {
      this._div.style.display = "block";
      this._div.style.left = `${x}px`;
    }
  }

  destroy() {
    if (this._div && this._div.parentElement) {
      this._div.parentElement.removeChild(this._div);
    }
    this._div = null;
  }
}

interface IChartProps {
  source: "1m" | "15m" | "1h";
  height: number;
  width: number;
  items: ICandleData[];
  eventAt: string;
}

const MOMENT_STAMP_OFFSET = getMomentStamp(
  dayjs("2025-07-26T00:00:00Z"),
  "minute"
);

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

const formatAmount = (value: number | string, scale = 2, separator = ",") => {
  const num = typeof value === "string" ? Number(value) : value;
  const str = num.toFixed(scale);
  const formatted =
    num < 10000 ? str : str.replace(/(\d)(?=(\d{3})+(\.|$))/g, `$1 `);
  return formatted.replace(/.00$/, "").replace(".", separator);
};

type Ref = React.MutableRefObject<HTMLDivElement>;

export const SimpleStockChart = ({
  source,
  height,
  width,
  items,
  eventAt,
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
          } else {
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
        } else {
          const alignedDate = date.startOf("hour");
          momentStamp = getMomentStamp(alignedDate, "hour");
          time = momentStamp as Time;
        }

        if (!date.isValid()) {
          console.warn(`Invalid date at index ${idx}: momentStamp: ${momentStamp}`);
          return null;
        }

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
      localization: {
        priceFormatter: (price: number) => formatAmount(price, getPriceScale(price)),
      },
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
          if (!candle || !candle.originalTime) return "Invalid date";
          const date = dayjs(candle.originalTime);
          if (!date.isValid()) return "Invalid date";
          if (source === "1m") return date.format("HH:mm:ss");
          if (source === "15m") return date.format("HH:mm");
          return date.format("DD/MM HH:mm");
        },
      },
    });

    const lineSeries = chart.addLineSeries({
      lastValueVisible: false,
    });

    lineSeries.setData(candles);

    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const data = candles.find((d) => d.momentStamp === Number(param.time));
        if (data) {
          const dateFormat =
            source === "1m" ? "DD/MM/YYYY HH:mm:ss" : "DD/MM/YYYY HH:mm";
          const dateTime = dayjs(data.originalTime).format(dateFormat);
          const price = formatAmount(data.value, getPriceScale(data.value));
          setTooltipDate(`${dateTime}: ${price}`);
        } else {
          setTooltipDate(null);
        }
      } else {
        setTooltipDate(null);
      }
    });

    let vertLine: VertLine | null = null;
    const eventDate = dayjs(eventAt);
    if (eventDate.isValid()) {
      let eventTime: Time;
      if (source === "1m") {
        eventTime = getMomentStamp(eventDate, "minute") as Time;
      } else if (source === "15m") {
        const minute = Math.floor(eventDate.minute() / 15) * 15;
        const alignedDate = eventDate.startOf("hour").add(minute, "minute");
        eventTime = getMomentStamp(alignedDate, "minute") as Time;
      } else {
        const alignedDate = eventDate.startOf("hour");
        eventTime = getMomentStamp(alignedDate, "hour") as Time;
      }

      vertLine = new VertLine(chart, lineSeries, eventTime, {
        showLabel: true,
        labelText: "Event",
        color: colors.blue[500],
        width: 2,
      });
    }

    chart.timeScale().fitContent();

    return () => {
      if (vertLine) {
        vertLine.destroy();
      }
      chart.remove();
    };
  }, [source, height, width, items, eventAt]);

  return (
    <div ref={elementRef} className={classes.root}>
      {tooltipDate && <div className={classes.tooltip}>{tooltipDate}</div>}
    </div>
  );
};

export default SimpleStockChart;
