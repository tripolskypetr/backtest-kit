import fs from "fs/promises";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";

const MOCK_STRATEGY_PATH = "./mock/strategy.json";
const MOCK_STRATEGY_INFO_PATH = "./mock/strategy-info.json";

const READ_STRATEGY_FN = singleshot(
    async () => {
        const data = await fs.readFile(MOCK_STRATEGY_PATH, "utf-8");
        return JSON.parse(data);
    },
);

const READ_STRATEGY_INFO_FN = singleshot(
    async () => {
        const data = await fs.readFile(MOCK_STRATEGY_INFO_PATH, "utf-8");
        return JSON.parse(data);
    },
);

export class ControlMockService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public getStatus = async (symbol: string, context: { strategyName: string; exchangeName: string; }) => {
        this.loggerService.log("controlMockService getStatus", {
            symbol,
            context,
        })
        const strategyInfo = await READ_STRATEGY_INFO_FN();
        const pendingSignal = await READ_STRATEGY_FN();
        const currentPrice = pendingSignal?.pnl?.priceClose ?? pendingSignal?.priceOpen ?? 0;
        return { strategyInfo, pendingSignal, currentPrice };
    }

    public commitOpenPending = async (
        symbol: string, 
        context: { strategyName: string; exchangeName: string; },
        dto: { position: "long" | "short", cost: number, note: string }
    ) => {
        this.loggerService.log("controlMockService commitOpenPending", {
            symbol,
            context,
            dto,
        })
    }

    public commitAverageBuy = async (
        symbol: string, 
        context: { strategyName: string; exchangeName: string; },
        dto: { cost: number, note: string }
    ) => {
        this.loggerService.log("controlMockService commitAverageBuy", {
            symbol,
            context,
            dto,
        })
    }

    public commitClosePending = async (
        symbol: string, 
        context: { strategyName: string; exchangeName: string; },
        dto: { note: string }
    ) => {
        this.loggerService.log("controlMockService commitClosePending", {
            symbol,
            context,
            dto,
        })
    }

    public commitBreakeven = async (
        symbol: string, 
        context: { strategyName: string; exchangeName: string; },
    ) => {
        this.loggerService.log("controlMockService commitBreakeven", {
            symbol,
            context,
        })
    }
}

export default ControlMockService;
