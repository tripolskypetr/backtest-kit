import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import StockChart from "../components/StockChart";
import { useMemo } from "react";
import { SignalClosedNotification } from "backtest-kit";

export const Candle1hView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        pendingAt,
        closedAt,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
    } = useMemo(() => {
        const notification = formState.data.main as SignalClosedNotification;
        return {
            position: notification.position,
            pendingAt: new Date(notification.pendingAt || notification.scheduledAt).toISOString(),
            closedAt: new Date(notification.createdAt).toISOString(),
            priceOpen: notification.priceOpen,
            priceStopLoss: notification.priceStopLoss,
            priceTakeProfit: notification.priceTakeProfit,
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
                        priceStopLoss={priceStopLoss}
                        priceTakeProfit={priceTakeProfit}
                        status="closed"
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
