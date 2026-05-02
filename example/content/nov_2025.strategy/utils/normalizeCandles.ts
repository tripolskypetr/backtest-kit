import { ICandleData } from "backtest-kit";

export const normalizeCandles = (candles: ICandleData[]): number[] => {
    return candles.map((candle) => {
        const { close, high, low } = candle;

        if (high === low) {
            return 0.5;
        }

        return (close - low) / (high - low);
    });
};
