import { Ollama } from "ollama";

export async function json(messages) {
    const ollama = new Ollama({
        host: "https://ollama.com",
        headers: {
            Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
        },
    });

    const response = await ollama.chat({
        model: "deepseek-v3.1:671b",
        messages: [
            {
                role: "system",
                content: [
                    "Проанализируй торговую стратегию и верни торговый сигнал.",
                    "",
                    "ПРАВИЛА ОТКРЫТИЯ ПОЗИЦИЙ:",
                    "",
                    "1. ТИПЫ ПОЗИЦИЙ:",
                    "   - position='wait': нет четкого сигнала, жди лучших условий",
                    "   - position='long': бычий сигнал, цена будет расти",
                    "   - position='short': медвежий сигнал, цена будет падать",
                    "",
                    "2. ЦЕНА ВХОДА (priceOpen):",
                    "   - Может быть текущей рыночной ценой для немедленного входа",
                    "   - Может быть отложенной ценой для входа при достижении уровня",
                    "   - Укажи оптимальную цену входа согласно технического анализа",
                    "",
                    "3. УРОВНИ ВЫХОДА:",
                    "   - LONG: priceTakeProfit > priceOpen > priceStopLoss",
                    "   - SHORT: priceStopLoss > priceOpen > priceTakeProfit",
                    "   - Уровни должны иметь техническое обоснование (Fibonacci, S/R, Bollinger)",
                    "",
                    "4. ВРЕМЕННЫЕ РАМКИ:",
                    "   - minuteEstimatedTime: прогноз времени до TP (макс 360 минут)",
                    "   - Расчет на основе ATR, ADX, MACD, Momentum, Slope",
                    "   - Если индикаторов, осциллятор или других метрик нет, посчитай их самостоятельно",
                ].join("\n"),
            },
            ...messages,
        ],
        format: {
            type: "object",
            properties: {
                position: {
                    type: "string",
                    enum: ["wait", "long", "short"],
                    description: "Trade decision: wait (no signal), long (buy), or short (sell)",
                },
                note: {
                    type: "string",
                    description: "Professional trading recommendation with price levels",
                },
                priceOpen: {
                    type: "number",
                    description: "Entry price (current market price or limit order price)",
                },
                priceTakeProfit: {
                    type: "number",
                    description: "Take profit target price",
                },
                priceStopLoss: {
                    type: "number",
                    description: "Stop loss exit price",
                },
                minuteEstimatedTime: {
                    type: "number",
                    description: "Expected time to reach TP in minutes (max 360)",
                },
            },
            required: ["position", "note", "priceOpen", "priceTakeProfit", "priceStopLoss", "minuteEstimatedTime"],
        },
    });

    const jsonResponse = JSON.parse(response.message.content.trim());
    return jsonResponse;
}

export default json;
