interface ForecastResponseContract {
    sentiment: "bullish" | "bearish" | "neutral" | "sideways";
    signal: "BUY" | "SELL" | "WAIT";
    reasoning: string;
}

export { ForecastResponseContract }
