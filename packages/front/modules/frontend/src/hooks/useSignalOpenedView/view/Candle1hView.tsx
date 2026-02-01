import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import SignalOpenedChart from "../components/SignalOpenedChart/SignalOpenedChart";
import { useMemo } from "react";
import { SignalOpenedNotification } from "backtest-kit";

export const Candle1hView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        priceOpen,
        priceStopLoss,
        priceTakeProfit,
        createdAt,
    } = useMemo(() => {
        const {
            position,
            priceOpen,
            priceTakeProfit,
            priceStopLoss,
            createdAt,
        } = formState.data.main as SignalOpenedNotification;
        return {
            position,
            priceOpen,
            priceStopLoss,
            priceTakeProfit,
            createdAt: new Date(createdAt).toISOString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <SignalOpenedChart
                        items={data}
                        createdAt={createdAt}
                        position={position}
                        priceOpen={priceOpen}
                        priceStopLoss={priceStopLoss}
                        priceTakeProfit={priceTakeProfit}
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
