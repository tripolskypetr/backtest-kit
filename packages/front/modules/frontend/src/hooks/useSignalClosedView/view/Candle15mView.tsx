import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import SignalClosedChart from "../components/SignalClosedChart/SignalClosedChart";
import { useMemo } from "react";
import { SignalClosedNotification } from "backtest-kit";

export const Candle15mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        priceOpen,
        priceClose,
        pnlPercentage,
        createdAt,
    } = useMemo(() => {
        const {
            position,
            priceOpen,
            priceClose,
            pnlPercentage,
            createdAt,
        } = formState.data.main as SignalClosedNotification;
        return {
            position,
            priceOpen,
            priceClose,
            pnlPercentage,
            createdAt: new Date(createdAt).toUTCString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <SignalClosedChart
                        items={data}
                        createdAt={createdAt}
                        position={position}
                        priceOpen={priceOpen}
                        priceClose={priceClose}
                        pnlPercentage={pnlPercentage}
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
