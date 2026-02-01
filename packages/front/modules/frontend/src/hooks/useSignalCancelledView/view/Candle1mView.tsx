import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import SignalCancelledChart from "../components/SignalCancelledChart/SignalCancelledChart";
import { useMemo } from "react";
import { SignalCancelledNotification } from "backtest-kit";

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const {
        cancelReason,
        createdAt,
    } = useMemo(() => {
        const {
            cancelReason,
            createdAt,
        } = formState.data.main as SignalCancelledNotification;
        return {
            cancelReason,
            createdAt: new Date(createdAt).toUTCString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <SignalCancelledChart
                        items={data}
                        createdAt={createdAt}
                        cancelReason={cancelReason}
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
