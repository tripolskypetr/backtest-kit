import * as tf from "@tensorflow/tfjs";
import { ICandleData } from "backtest-kit";
import { normalizeCandles } from "./normalizeCandles";

export const predictNextClose = (
    model: tf.LayersModel,
    candles: ICandleData[],
    nextCandleRange: { low: number; high: number }
): { normalized: number; price: number } => {
    if (candles.length !== 8) {
        throw new Error('predictNextClose requires exactly 8 candles');
    }

    const normalized = normalizeCandles(candles);

    const input = tf.tensor2d([normalized]);
    const prediction = model.predict(input) as tf.Tensor;
    const predictionValue = prediction.dataSync()[0];

    input.dispose();
    prediction.dispose();

    const { low, high } = nextCandleRange;

    return {
        normalized: predictionValue,
        price: low + predictionValue * (high - low)
    };
};
