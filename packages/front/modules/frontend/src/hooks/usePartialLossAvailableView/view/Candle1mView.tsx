import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import PartialLossAvailableChart from "../components/PartialLossAvailableChart/PartialLossAvailableChart";
import { useMemo } from "react";
import { PartialLossAvailableNotification } from "backtest-kit";

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        priceOpen,
        currentPrice,
        level,
        createdAt,
    } = useMemo(() => {
        const partialLossAvailable = formState.data.main as PartialLossAvailableNotification;
        return {
            position: partialLossAvailable.position,
            priceOpen: partialLossAvailable.priceOpen,
            currentPrice: partialLossAvailable.currentPrice,
            level: partialLossAvailable.level,
            createdAt: new Date(partialLossAvailable.createdAt).toUTCString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <PartialLossAvailableChart
                        items={data}
                        createdAt={createdAt}
                        position={position}
                        priceOpen={priceOpen}
                        currentPrice={currentPrice}
                        level={level}
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
