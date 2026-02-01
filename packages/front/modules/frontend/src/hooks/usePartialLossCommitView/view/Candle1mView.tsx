import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import PartialLossCommitChart from "../components/PartialLossCommitChart/PartialLossCommitChart";
import { useMemo } from "react";
import { PartialLossCommitNotification } from "backtest-kit";

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const {
        currentPrice,
        percentToClose,
        createdAt,
    } = useMemo(() => {
        const partialLossCommit = formState.data.main as PartialLossCommitNotification;
        return {
            currentPrice: partialLossCommit.currentPrice,
            percentToClose: partialLossCommit.percentToClose,
            createdAt: new Date(partialLossCommit.createdAt).toUTCString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <PartialLossCommitChart
                        items={data}
                        createdAt={createdAt}
                        currentPrice={currentPrice}
                        percentToClose={percentToClose}
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
