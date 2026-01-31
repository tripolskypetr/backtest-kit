import { Box, Typography } from "@mui/material";
import { AutoSizer, IOutletModalProps, useAsyncValue } from "react-declarative";
import StockChart from "../../../widgets/StockChart/StockChart";
import { useMemo } from "react";
import { fetchPriceCandles } from "../api/fetchPriceCandles";
import { IStorageSignalRow } from "backtest-kit";

export const Candle15mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        createdAt,
        updatedAt,
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
            createdAt = pendingAt || scheduledAt,
            updatedAt,

            originalPriceStopLoss,
            originalPriceTakeProfit,
        } = formState.data.main as IStorageSignalRow;
        return {
            position,
            createdAt: new Date(createdAt).toISOString(),
            updatedAt: new Date(updatedAt).toISOString(),
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
                        createdAt={createdAt}
                        updatedAt={updatedAt}
                        position={position}
                        priceOpen={priceOpen}
                        priceTakeProfit={priceTakeProfit}
                        priceStopLoss={priceStopLoss}
                        originalPriceTakeProfit={originalPriceTakeProfit}
                        originalPriceStopLoss={originalPriceStopLoss}
                        status={status}
                        height={height}
                        width={width}
                        source="15m"
                    />
                )}
            </AutoSizer>
        </Box>
    );
};

export default Candle15mView;
