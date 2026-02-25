import * as React from 'react';
import { useRef, useLayoutEffect } from 'react';

import {
    DeepPartial,
    ChartOptions,
    LineStyleOptions,
    SeriesOptionsCommon,
    MouseEventParams,
    BusinessDay,
} from 'lightweight-charts';

import { makeStyles } from '../../../styles';

import { createChart } from 'lightweight-charts';

import IStockItem from '../model/StockItem.model';
import { AutoSizer } from 'react-declarative';
import wordForm from '../../../utils/wordForm';
import { t } from '../../../i18n';

interface IChartProps {
    height: number;
    width: number;
    items: IStockItem[];
}

const useStyles = makeStyles()({
    root: {
        position: 'relative',
    },
    tooltip: {
        position: 'absolute',
        color: 'gray',
        margin: 0,
        left: 5,
        top: 5,
    },
});

const chartOptions: DeepPartial<ChartOptions> = {
    layout: {
        textColor: '#d1d4dc',
        backgroundColor: '#0000',
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
            color: '#ebe0e301',
            style: 0,
        },
        horzLine: {
            visible: false,
            labelVisible: false,
        },
    },
    grid: {
        vertLines: {
            color: '#f8b3',
        },
        horzLines: {
            color: '#f8b3',
        },
    },
    handleScroll: {
        vertTouchDrag: false,
    },
};

type Ref = React.MutableRefObject<HTMLDivElement>;

const seriesOptions: DeepPartial<LineStyleOptions & SeriesOptionsCommon> = {
    color: '#90cbfa',
    lineWidth: 2,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
};

const Chart = ({
    height,
    width,
    items,
}: IChartProps) => {

    const { classes } = useStyles();

    const elementRef: Ref  = useRef<HTMLDivElement>(
        undefined as never
    );

    const tooltipRef: Ref = useRef<HTMLDivElement>(
        undefined as never
    );

    useLayoutEffect(() => {

        const { current: chartElement } = elementRef;
        const { current: tooltipElement } = tooltipRef;

        const chart = createChart(chartElement, {
            ...chartOptions,
            height,
            width, 
        });
      
        const series = chart.addLineSeries({
            ...seriesOptions
        });

        series.setData(items);

        const crosshairMoveHandler = ({
            time,
        }: MouseEventParams) => {
            if (!time) {
                tooltipElement.innerHTML = '';
                return;
            }
            try {
                const { day, month, year } = time as BusinessDay;
                const item = items.find(({ time }) => time.day === day && time.month === month && time.year === year);
                if (item) {
                    const count = Math.round(Math.round(item.value * 100) / 100);
                    tooltipElement.innerHTML = `${t("Total")}: ${count}, ${t("Resolved")}: ${item.resolved}, ${t("Rejected")}: ${item.rejected}`;
                } else {
                    tooltipElement.innerHTML = '';
                }
            } catch (error) {
                console.log(error);
                tooltipElement.innerHTML = '';
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
        <div
            ref={elementRef}
            className={classes.root}
        >
            <p
                ref={tooltipRef}
                className={classes.tooltip}
            />
        </div>
    );
};

interface IStockChartProps {
    items: IStockItem[];
}

export const StockChart = ({
    items,
}: IStockChartProps) => (
    <AutoSizer>
        {({ height, width }) => (
            <Chart
                height={height}
                width={width}
                items={items}
            />
        )}
    </AutoSizer>
);

export default StockChart;
