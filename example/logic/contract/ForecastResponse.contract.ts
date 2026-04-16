interface ForecastResponseContract {
    sentiment: "bullish" | "bearish" | "neutral" | "sideways";
    reasoning: string;
}

export { ForecastResponseContract }
