import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import SignalScheduledChart from "../components/SignalScheduledChart/SignalScheduledChart";
import { useMemo } from "react";
import { SignalScheduledNotification } from "backtest-kit";

export const Candle15mView = ({ data, formState }: IOutletModalProps) => {
    const {
        priceOpen,
        currentPrice,
        createdAt,
    } = useMemo(() => {
        const {
            priceOpen,
            currentPrice,
            createdAt,
        } = formState.data.main as SignalScheduledNotification;
        return {
            priceOpen,
            currentPrice,
            createdAt: new Date(createdAt).toUTCString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <SignalScheduledChart
                        items={data}
                        createdAt={createdAt}
                        priceOpen={priceOpen}
                        currentPrice={currentPrice}
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
