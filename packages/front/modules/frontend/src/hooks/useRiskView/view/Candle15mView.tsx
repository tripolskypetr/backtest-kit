import { Box, Typography } from "@mui/material";
import { AutoSizer, IOutletModalProps, useAsyncValue } from "react-declarative";
import StockChart from "../components/StockChart/StockChart";
import { useMemo } from "react";
import { RiskRejectionNotification } from "backtest-kit";

export const Candle15mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
        minuteEstimatedTime,
        createdAt,
    } = useMemo(() => {
        const {
            pendingSignal: {
                position,
                priceOpen,
                priceTakeProfit,
                priceStopLoss,
                minuteEstimatedTime,
            },
            createdAt,
        } = formState.data.main as RiskRejectionNotification;
        return {
            position,
            priceOpen,
            priceStopLoss,
            priceTakeProfit,
            minuteEstimatedTime,
            createdAt: new Date(createdAt).toUTCString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <StockChart
                        items={data}
                        createdAt={createdAt}
                        position={position}
                        priceOpen={priceOpen}
                        priceStopLoss={priceStopLoss}
                        priceTakeProfit={priceTakeProfit}
                        minuteEstimatedTime={minuteEstimatedTime}
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
