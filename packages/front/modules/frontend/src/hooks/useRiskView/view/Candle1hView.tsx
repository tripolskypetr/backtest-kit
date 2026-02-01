import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import StockChart from "../components/StockChart/StockChart";
import { useMemo } from "react";
import { RiskRejectionNotification } from "backtest-kit";

export const Candle1hView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        createdAt,
        updatedAt,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
    } = useMemo(() => {
        const notification = formState.data.main as RiskRejectionNotification;
        const createdAtDate = new Date(notification.createdAt).toISOString();
        return {
            position: notification.position,
            createdAt: createdAtDate,
            updatedAt: createdAtDate,
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
                        createdAt={createdAt}
                        updatedAt={updatedAt}
                        position={position}
                        priceOpen={priceOpen}
                        priceStopLoss={priceStopLoss}
                        priceTakeProfit={priceTakeProfit}
                        status="cancelled"
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
