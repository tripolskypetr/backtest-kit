import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import SimpleStockChart from "../components/SimpleStockChart";
import { useMemo } from "react";
import { StrategyPauseNotification } from "backtest-kit";

export const Candle1hView = ({ data, formState }: IOutletModalProps) => {
    const { createdAt } = useMemo(() => {
        const notification = formState.data.main as StrategyPauseNotification;
        return {
            createdAt: new Date(notification.createdAt).toISOString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <SimpleStockChart
                        items={data}
                        eventAt={createdAt}
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
