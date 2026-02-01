import { Box } from "@mui/material";
import { AutoSizer, IOutletModalProps } from "react-declarative";
import PartialProfitAvailableChart from "../components/PartialProfitAvailableChart/PartialProfitAvailableChart";
import { useMemo } from "react";
import { PartialProfitAvailableNotification } from "backtest-kit";

export const Candle1mView = ({ data, formState }: IOutletModalProps) => {
    const {
        position,
        priceOpen,
        currentPrice,
        level,
        createdAt,
    } = useMemo(() => {
        const partialProfitAvailable = formState.data.main as PartialProfitAvailableNotification;
        return {
            position: partialProfitAvailable.position,
            priceOpen: partialProfitAvailable.priceOpen,
            currentPrice: partialProfitAvailable.currentPrice,
            level: partialProfitAvailable.level,
            createdAt: new Date(partialProfitAvailable.createdAt).toUTCString(),
        };
    }, [formState.data.main]);

    return (
        <Box sx={{ height: "100%", width: "100%", pt: 1 }}>
            <AutoSizer payload={data}>
                {({ height, width }) => (
                    <PartialProfitAvailableChart
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
