import { Paper, Box, Typography, Divider, SxProps } from "@mui/material";
import {
    AutoSizer,
    LoaderView,
    TSubject,
    useAsyncValue,
    useOnce,
} from "react-declarative";
import { CandleInterval } from "backtest-kit";
import ioc from "../../../../lib";
import StockChart from "./StockChart";

const colorMap: Record<string, string> = {
    "1m": "#2979ff",
    "15m": "#f3a43a",
    "1h": "#d500f9",
};

const titleMap: Record<string, string> = {
    "1m": "1 минута",
    "15m": "15 минут",
    "1h": "1 час",
};

interface IPriceChartWidgetProps {
    symbol: string;
    interval: CandleInterval;
    reloadSubject: TSubject<void>;
    sx?: SxProps;
}

export const PriceChartWidget = ({
    symbol,
    interval,
    reloadSubject,
    sx,
}: IPriceChartWidgetProps) => {
    const [candles, { loading, execute }] = useAsyncValue(
        async () => {
            return await ioc.exchangeViewService.getLastCandles(symbol, interval);
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
            deps: [symbol, interval],
        },
    );

    useOnce(() => reloadSubject.subscribe(execute));

    const renderInner = () => {
        if (!candles || loading) {
            return <LoaderView sx={{ height: "100%", width: "100%" }} />;
        }
        return (
            <Box sx={{ position: "relative", flex: 1 }}>
                <AutoSizer style={{ position: "absolute" }}>
                    {({ height, width }) => (
                        <StockChart
                            items={candles}
                            height={height}
                            width={width}
                        />
                    )}
                </AutoSizer>
            </Box>
        );
    };

    return (
        <Paper
            sx={{
                ...sx,
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                overflow: "hidden",
            }}
        >
            <Box
                sx={{
                    background: colorMap[interval] || "#607d8b",
                    minHeight: "48px",
                    display: "flex",
                    alignItems: "center",
                    pl: 2,
                }}
            >
                <Typography
                    variant="h6"
                    sx={{ color: "white", fontWeight: "bold" }}
                >
                    {titleMap[interval] || interval}
                </Typography>
            </Box>
            <Divider />
            {renderInner()}
        </Paper>
    );
};

export default PriceChartWidget;
