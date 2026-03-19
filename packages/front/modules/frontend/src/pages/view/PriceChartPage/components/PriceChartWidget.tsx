import { Paper, Box, Typography, Divider, SxProps, Chip } from "@mui/material";
import {
    ActionIcon,
    AutoSizer,
    LoaderView,
    TSubject,
    useActualValue,
    useAsyncValue,
    useOnce,
} from "react-declarative";
import { CandleInterval } from "backtest-kit";
import ioc from "../../../../lib";
import StockChart from "./StockChart";
import { Info } from "@mui/icons-material";

const colorMap: Record<string, string> = {
    "1m": "#2979ff",
    "15m": "#f3a43a",
    "1h": "#d500f9",
};

const titleMap: Record<string, string> = {
    "1m": "1 minute",
    "15m": "15 minutes",
    "1h": "1 hour",
};

function downloadJson(
    jsonString: string,
    fileName: string = "data.json",
): void {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    ioc.layoutService.downloadFile(url, fileName);
}

interface IPriceChartWidgetProps {
    symbol: string;
    disableInfo: boolean;
    interval: CandleInterval;
    reloadSubject: TSubject<void>;
    downloadSubject: TSubject<void>;
    onInfoClick: () => void;
    position: "long" | "short" | null;
    priceOpen: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    sx?: SxProps;
}

export const PriceChartWidget = ({
    symbol,
    interval,
    reloadSubject,
    downloadSubject,
    onInfoClick,
    disableInfo,
    position,
    priceOpen,
    priceStopLoss,
    priceTakeProfit,
    sx,
}: IPriceChartWidgetProps) => {
    const [candles, { loading, execute }] = useAsyncValue(
        async () => {
            return await ioc.exchangeViewService.getLastCandles(
                symbol,
                interval,
            );
        },
        {
            onLoadStart: () => ioc.layoutService.setAppbarLoader(true),
            onLoadEnd: () => ioc.layoutService.setAppbarLoader(false),
            deps: [symbol, interval],
        },
    );

    const candles$ = useActualValue(candles);

    useOnce(() => reloadSubject.subscribe(execute));

    useOnce(() =>
        downloadSubject.subscribe(() => {
            const { current: candles } = candles$;
            downloadJson(
                JSON.stringify(candles, null, 2),
                `${symbol}-${interval}.json`,
            );
        }),
    );

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
                            position={position}
                            priceOpen={priceOpen}
                            priceStopLoss={priceStopLoss}
                            priceTakeProfit={priceTakeProfit}
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
                    pr: 1,
                }}
            >
                <Typography
                    variant="h6"
                    sx={{ color: "white", fontWeight: "bold", mr: 1 }}
                >
                    {titleMap[interval] || interval}
                </Typography>
                {!!position && (
                    <Chip
                        variant="filled"
                        sx={{ color: "white" }}
                        color={position === "short" ? "warning" : "success"}
                        label={String(position).toUpperCase()}
                    />
                )}
                <Box sx={{ flex: 1 }} />
                <ActionIcon disabled={disableInfo} onClick={onInfoClick}>
                    <Info
                        style={{
                            color: "white",
                            opacity: disableInfo ? 0.5 : 1.0,
                        }}
                    />
                </ActionIcon>
            </Box>
            <Divider />
            {renderInner()}
        </Paper>
    );
};

export default PriceChartWidget;
