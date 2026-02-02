import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import StockChart from "../components/StockChart";
import { useMemo } from "react";
import { SignalOpenedNotification } from "backtest-kit";

export const Candle15mView = ({ data, formState }: IOutletModalProps) => {
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
                        source="15m"
                    />
                )}
            </AutoSizer>
        </Box>
    );
};

export default Candle15mView;
