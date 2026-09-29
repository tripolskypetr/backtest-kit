import { Box, Typography } from "@mui/material";
import { AutoSizer, Center, IOutletModalProps } from "react-declarative";
import StockChart from "../components/StockChart";
import { useMemo } from "react";
import { SignalOpenedNotification } from "backtest-kit";

export const Candle1hView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        pendingAt,
        closedAt,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
    } = useMemo(() => {
        const notification = formState.data.main as SignalOpenedNotification;
        const pendingAtDate = new Date(notification.pendingAt || notification.scheduledAt).toISOString();
        return {
            position: notification.position,
            pendingAt: pendingAtDate,
            closedAt: pendingAtDate,
            priceOpen: notification.priceOpen,
            priceStopLoss: notification.priceStopLoss,
            priceTakeProfit: notification.priceTakeProfit,
        };
    }, [formState.data.main]);

    if (!data?.length) {
        return (
            <Center sx={{ height: "100%", width: "100%", pt: 1 }}>
                <Typography variant="h6" sx={{opacity: 0.5, fontWeight: "bold"}}>
                    An error acquired
                </Typography>
            </Center>
        );
    }

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
