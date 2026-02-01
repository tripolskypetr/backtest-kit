import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import BreakevenAvailableChart from "../components/BreakevenAvailableChart/BreakevenAvailableChart";
import { useMemo } from "react";
import { BreakevenAvailableNotification } from "backtest-kit";

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        priceOpen,
        currentPrice,
        createdAt,
    } = useMemo(() => {
        const breakevenAvailable = formState.data.main as BreakevenAvailableNotification;
        return {
            position: breakevenAvailable.position,
            priceOpen: breakevenAvailable.priceOpen,
            currentPrice: breakevenAvailable.currentPrice,
            createdAt: new Date(breakevenAvailable.createdAt).toUTCString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <BreakevenAvailableChart
                        items={data}
                        createdAt={createdAt}
                        position={position}
                        priceOpen={priceOpen}
                        currentPrice={currentPrice}
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
