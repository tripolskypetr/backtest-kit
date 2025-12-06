import { Ollama } from "ollama";
import ccxt from "ccxt";
import {
    addExchange,
    addStrategy,
    addFrame,
    addWalker,
    Walker,
    Backtest,
    getCandles,
    listenSignalBacktest,
    listenWalkerComplete,
    listenDoneBacktest,
    listenBacktestProgress,
    listenWalkerProgress,
    listenError,
} from "backtest-kit";
import { promises as fs } from "fs";
import { v4 as uuid } from "uuid";
import path from "path";

import { json } from "./utils/json.mjs";

addFrame({
    frameName: "ttq6t_test_frame",
    interval: "1m",
    startDate: new Date("2025-12-01T00:00:00.000Z"),
    endDate: new Date("2025-12-01T23:59:59.000Z"),
});

addStrategy({
    strategyName: "ttq6t_strategy-1",
    interval: "5m",
    getSignal: async (symbol) => {
        const messages = [];

        // Загружаем данные всех таймфреймов
        const microTermCandles = await getCandles(symbol, "1m", 30);
        const mainTermCandles = await getCandles(symbol, "5m", 24);
        const shortTermCandles = await getCandles(symbol, "15m", 24);
        const mediumTermCandles = await getCandles(symbol, "1h", 24);

        function formatCandles(candles, timeframe) {
            return candles.map((c) =>
                `${new Date(c.timestamp).toISOString()}[${timeframe}]: O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`
            ).join("\n");
        }

        // Сообщение 1: Среднесрочный тренд
        messages.push(
            {
                role: "user",
                content: [
                    `${symbol}`,
                    "Проанализируй свечи 1h:",
                    "",
                    formatCandles(mediumTermCandles, "1h")
                ].join("\n"),
            },
            {
                role: "assistant",
                content: "Тренд 1h проанализирован",
            }
        );

        // Сообщение 2: Краткосрочный тренд
        messages.push(
            {
                role: "user",
                content: [
                    "Проанализируй свечи 15m:",
                    "",
                    formatCandles(shortTermCandles, "15m")
                ].join("\n"),
            },
            {
                role: "assistant",
                content: "Тренд 15m проанализирован",
            }
        );

        // Сообщение 3: Основной таймфрейм
        messages.push(
            {
                role: "user",
                content: [
                    "Проанализируй свечи 5m:",
                    "",
                    formatCandles(mainTermCandles, "5m")
                ].join("\n")
            },
            {
                role: "assistant",
                content: "Таймфрейм 5m проанализирован",
            }
        );

        // Сообщение 4: Микро-структура
        messages.push(
            {
                role: "user",
                content: [
                    "Проанализируй свечи 1m:",
                    "",
                    formatCandles(microTermCandles, "1m")
                ].join("\n")
            },
            {
                role: "assistant",
                content: "Микроструктура 1m проанализирована",
            }
        );

        // Сообщение 5: Запрос сигнала
        messages.push(
            {
                role: "user",
                content: [
                    "Проанализируй все таймфреймы и сгенерируй торговый сигнал согласно этой стратегии. Открывай позицию ТОЛЬКО при четком сигнале.",
                    "",
                    ``,
                    "",
                    "Если сигналы противоречивы или тренд слабый то position: wait"
                ].join("\n"),
            }
        );

        const resultId = uuid();

        const result = await json(messages);

        await dumpJson(resultId, messages, result);

        return result;
    },
});
