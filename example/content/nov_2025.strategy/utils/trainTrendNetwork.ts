import { ICandleData } from "backtest-kit";
import { normalizeCandles } from "./normalizeCandles";
import * as tf from "@tensorflow/tfjs";

export const trainTrendNetwork = async (candles: ICandleData[]): Promise<tf.LayersModel> => {
    const normalized = normalizeCandles(candles);

    const WINDOW_SIZE = 8;
    const inputs: number[][] = [];
    const outputs: number[] = [];

    for (let i = 0; i < normalized.length - WINDOW_SIZE - 1; i++) {
        const input = normalized.slice(i, i + WINDOW_SIZE);
        const nextValue = normalized[i + WINDOW_SIZE + 1];

        inputs.push(input);
        outputs.push(nextValue);
    }

    console.log(`Training data prepared: ${inputs.length} samples\n`);

    const xs = tf.tensor2d(inputs);
    const ys = tf.tensor2d(outputs, [outputs.length, 1]);

    const model = tf.sequential({
        layers: [
            tf.layers.dense({
                inputShape: [8],
                units: 6,
                activation: 'relu',
                kernelInitializer: 'heNormal',
            }),
            tf.layers.dense({
                units: 4,
                activation: 'relu',
                kernelInitializer: 'heNormal',
            }),
            tf.layers.dense({
                units: 1,
                activation: 'sigmoid', // Выход в диапазоне [0, 1]
            }),
        ],
    });

    model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'meanSquaredError',
        metrics: ['mse', 'mae'],
    });

    console.log('Model architecture:');
    model.summary();
    console.log();

    console.log('Training model...\n');
    await model.fit(xs, ys, {
        epochs: 100,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
            onEpochEnd: (epoch: number, logs: any) => {
                if (epoch % 10 === 0) {
                    console.log(
                        `Epoch ${epoch + 1}/100 - ` +
                        `loss: ${logs?.loss.toFixed(6)} - ` +
                        `mse: ${logs?.mse.toFixed(6)} - ` +
                        `mae: ${logs?.mae.toFixed(6)} - ` +
                        `val_loss: ${logs?.val_loss.toFixed(6)}`
                    );
                }
            },
        },
    });

    xs.dispose();
    ys.dispose();

    console.log('\n✓ Training completed!\n');

    return model;
};