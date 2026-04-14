import { GridLevelContract } from "./GridLevel.contract";

interface GridResponseContract {
    bias: "BULLISH" | "BEARISH" | "NEUTRAL";
    confidence: "LOW" | "MEDIUM" | "HIGH";
    currentPrice: number;
    support: number[];
    resistance: number[];
    gridSide: "BUY" | "SELL" | "BOTH";
    gridLevels: GridLevelContract[];
    stopLoss: number;
    reasoning: string;
}

export { GridResponseContract }
