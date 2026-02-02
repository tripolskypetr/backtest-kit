import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import StockChart from "../components/StockChart";
import { useMemo } from "react";
import { SignalScheduledNotification } from "backtest-kit";

export const Candle1hView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        pendingAt,
        closedAt,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
    } = useMemo(() => {
        const notification = formState.data.main as SignalScheduledNotification;
        const scheduledAtDate = new Date(notification.scheduledAt).toISOString();
        return {
            position: notification.position,
            pendingAt: scheduledAtDate,
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
                        status="scheduled"
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
