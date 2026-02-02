import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import StockChart from "../components/StockChart/StockChart";
import { useMemo } from "react";
import { RiskRejectionNotification } from "backtest-kit";

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        pendingAt,
        closedAt,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
    } = useMemo(() => {
        const notification = formState.data.main as RiskRejectionNotification;
        const pendingAtDate = new Date(notification.createdAt).toISOString();
        return {
            position: notification.position,
            pendingAt: pendingAtDate,
            closedAt: pendingAtDate,
            priceOpen: notification.priceOpen ?? notification.currentPrice,
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
                        status="cancelled"
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
