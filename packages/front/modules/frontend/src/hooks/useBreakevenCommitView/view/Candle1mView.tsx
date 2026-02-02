import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import StockChart from "../components/StockChart";
import { useMemo } from "react";
import { BreakevenCommitNotification } from "backtest-kit";

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        pendingAt,
        createdAt,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
        originalPriceStopLoss,
        originalPriceTakeProfit,
    } = useMemo(() => {
        const notification = formState.data.main as BreakevenCommitNotification;
        return {
            position: notification.position,
            pendingAt: new Date(notification.pendingAt || notification.scheduledAt).toISOString(),
            createdAt: new Date(notification.createdAt).toISOString(),
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
                        pendingAt={pendingAt}
                        eventAt={createdAt}
                        position={position}
                        priceOpen={priceOpen}
                        priceStopLoss={priceStopLoss}
                        priceTakeProfit={priceTakeProfit}
                        originalPriceStopLoss={originalPriceStopLoss}
                        originalPriceTakeProfit={originalPriceTakeProfit}
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
