import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import StockChart from "../components/StockChart";
import { useMemo } from "react";
import { SignalClosedNotification } from "backtest-kit";

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        createdAt,
        updatedAt,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
    } = useMemo(() => {
        const notification = formState.data.main as SignalClosedNotification;
        return {
            position: notification.position,
            createdAt: new Date(notification.createdAt).toISOString(),
            updatedAt: new Date(notification.timestamp).toISOString(),
            priceOpen: notification.priceOpen,
            priceStopLoss: notification.priceClose,
            priceTakeProfit: notification.priceClose,
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
                        status="closed"
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
