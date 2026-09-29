import { Box, Typography } from "@mui/material";
import { AutoSizer, Center, IOutletModalProps } from "react-declarative";
import SimpleStockChart from "../components/SimpleStockChart";
import { useMemo } from "react";
import { ClosePendingCommitNotification } from "backtest-kit";

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const { createdAt } = useMemo(() => {
        const notification = formState.data.main as ClosePendingCommitNotification;
        return {
            createdAt: new Date(notification.createdAt).toISOString(),
        };
    }, [formState.data.main]);

    if (!data?.length) {
        return (
            <Center sx={{ height: "100%", width: "100%", pt: 1 }}>
                <Typography variant="h6" sx={{opacity: 0.5, fontWeight: "bold"}}>
                    An error acquired
                </Typography>
            </Center>
        );
    }

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <SimpleStockChart
                        items={data}
                        eventAt={createdAt}
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
