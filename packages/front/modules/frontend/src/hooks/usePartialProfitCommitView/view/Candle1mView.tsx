import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import PartialProfitCommitChart from "../components/PartialProfitCommitChart/PartialProfitCommitChart";
import { useMemo } from "react";
import { PartialProfitCommitNotification } from "backtest-kit";

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const {
        currentPrice,
        percentToClose,
        createdAt,
    } = useMemo(() => {
        const partialProfitCommit = formState.data.main as PartialProfitCommitNotification;
        return {
            currentPrice: partialProfitCommit.currentPrice,
            percentToClose: partialProfitCommit.percentToClose,
            createdAt: new Date(partialProfitCommit.createdAt).toUTCString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <PartialProfitCommitChart
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
