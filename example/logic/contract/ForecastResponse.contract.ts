interface ForecastResponseContract {
    sentiment: "bullish" | "bearish" | "neutral" | "sideways";
    confidence: "reliable" | "not_reliable";
    reasoning: string;
}

export { ForecastResponseContract }
