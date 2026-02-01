import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import StockChart from "../components/StockChart";
import { useMemo } from "react";
import { BreakevenAvailableNotification } from "backtest-kit";

export const Candle1hView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        createdAt,
        updatedAt,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
        originalPriceStopLoss,
        originalPriceTakeProfit,
    } = useMemo(() => {
        const notification = formState.data.main as BreakevenAvailableNotification;
        return {
            position: notification.position,
            createdAt: new Date(notification.pendingAt).toISOString(),
            updatedAt: new Date(notification.createdAt).toISOString(),
            priceOpen: notification.priceOpen,
            priceStopLoss: notification.priceStopLoss,
            priceTakeProfit: notification.priceTakeProfit,
            originalPriceStopLoss: notification.originalPriceStopLoss,
            originalPriceTakeProfit: notification.originalPriceTakeProfit,
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
                        priceStopLoss={priceStopLoss}
                        priceTakeProfit={priceTakeProfit}
                        originalPriceStopLoss={originalPriceStopLoss}
                        originalPriceTakeProfit={originalPriceTakeProfit}
                        status="opened"
                        height={height}
                        width={width}
                        source="1h"
                    />
                )}
            </AutoSizer>
        </Box>
    );
};

export default Candle1hView;
