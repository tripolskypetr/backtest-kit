import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import StockChart from "../components/StockChart";
import { useMemo } from "react";
import { SignalCancelledNotification } from "backtest-kit";

export const Candle15mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        createdAt,
        updatedAt,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
    } = useMemo(() => {
        const notification = formState.data.main as SignalCancelledNotification;
        const createdAtDate = new Date(notification.createdAt).toISOString();
        return {
            position: notification.position,
            createdAt: createdAtDate,
            updatedAt: new Date(notification.timestamp).toISOString(),
            priceOpen: 0,
            priceStopLoss: 0,
            priceTakeProfit: 0,
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
                        status="cancelled"
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
