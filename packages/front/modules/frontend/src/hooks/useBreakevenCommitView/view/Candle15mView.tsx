import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import BreakevenCommitChart from "../components/BreakevenCommitChart/BreakevenCommitChart";
import { useMemo } from "react";
import { BreakevenCommitNotification } from "backtest-kit";

export const Candle15mView = ({ data, formState }: IOutletModalProps) => {
    const {
        currentPrice,
        createdAt,
    } = useMemo(() => {
        const breakevenCommit = formState.data.main as BreakevenCommitNotification;
        return {
            currentPrice: breakevenCommit.currentPrice,
            createdAt: new Date(breakevenCommit.createdAt).toUTCString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <BreakevenCommitChart
                        items={data}
                        createdAt={createdAt}
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
