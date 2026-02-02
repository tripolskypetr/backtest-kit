import { Box, Typography } from "@mui/material";
import { AutoSizer, IOutletModalProps, useAsyncValue } from "react-declarative";
import StockChart from "../components/StockChart/StockChart";
import { useMemo } from "react";
import { IStorageSignalRow } from "backtest-kit";

const arr = [];

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        pendingAt,
        closedAt,
        status,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        originalPriceStopLoss,
        originalPriceTakeProfit,
    } = useMemo(() => {
        const {
            position,
            status,
            priceOpen,
            priceTakeProfit,
            priceStopLoss,
            pendingAt,
            scheduledAt,
            updatedAt,
            originalPriceStopLoss,
            originalPriceTakeProfit,
        } = formState.data.main as IStorageSignalRow;
        return {
            position,
            pendingAt: new Date(pendingAt || scheduledAt).toISOString(),
            closedAt: new Date(updatedAt).toISOString(),
            priceOpen,
            priceTakeProfit,
            priceStopLoss,
            originalPriceStopLoss,
            originalPriceTakeProfit,
            status,
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <StockChart
                        items={data}
                        pendingAt={pendingAt}
                        closedAt={closedAt}
                        position={position}
                        priceOpen={priceOpen}
                        priceTakeProfit={priceTakeProfit}
                        priceStopLoss={priceStopLoss}
                        originalPriceTakeProfit={originalPriceTakeProfit}
                        originalPriceStopLoss={originalPriceStopLoss}
                        status={status}
                        height={height}
                        width={width}
                        source="1m"
                    />
                )}
            </AutoSizer>
        </Box>
    );
};

export default Candle1mView;
