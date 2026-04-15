interface ForecastResponseContract {
    signal: "BUY" | "SELL" | "WAIT";
    reasoning: string;
}

export { ForecastResponseContract }
