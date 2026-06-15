import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Exchange, Live, Position, getConfig } from "backtest-kit";
import ControlMockService from "../mock/ControlMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

export class ControlViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly controlMockService = inject<ControlMockService>(TYPES.controlMockService);

    public getStatus = async (symbol: string, context: { strategyName: string; exchangeName: string; }) => {
        this.loggerService.log("controlViewService getStatus", {
            symbol,
            context,
        })
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.getStatus(symbol, context);
        }
        const liveList = await Live.list();
        const liveTarget = liveList.find((live) => live.symbol === symbol);
        if (liveTarget) {
            const currentPrice = await Exchange.getAveragePrice(symbol, {
                exchangeName: liveTarget.exchangeName,
            })
            const strategy = await Live.getStrategyStatus(symbol, context);
            const pending = await Live.getPendingSignal(symbol, currentPrice, context);
            return { strategyInfo: strategy, pendingSignal: pending, currentPrice };
        }
        throw new Error("ControlViewService getStatus live target not found");
    }

    public getAveragePrice = async (symbol: string, context: { strategyName: string; exchangeName: string; }): Promise<number> => {
        this.loggerService.log("controlViewService getAveragePrice", {
            symbol,
            context,
        })
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.getAveragePrice(symbol, context);
        }
        const liveList = await Live.list();
        const liveTarget = liveList.find((live) => live.symbol === symbol);
        if (liveTarget) {
            return await Exchange.getAveragePrice(symbol, {
                exchangeName: liveTarget.exchangeName,
            })
        }
        throw new Error("ControlViewService getAveragePrice live target not found");
    }

    public commitOpenPending = async (
        symbol: string, 
        context: { strategyName: string; exchangeName: string; },
        dto: { position: "long" | "short", cost: number, note: string }
    ) => {
        this.loggerService.log("controlViewService commitOpenPending", {
            symbol,
            context,
            dto,
        })
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.commitOpenPending(symbol, context, dto);
        }
        const liveList = await Live.list();
        const liveTarget = liveList.find((live) => live.symbol === symbol);
        if (liveTarget) {
            const currentPrice = await Exchange.getAveragePrice(symbol, {
                exchangeName: liveTarget.exchangeName,
            })
            const pending = await Live.getPendingSignal(symbol, currentPrice, context);
            const config = getConfig();
            if (pending) {
                throw new Error("ControlViewService commitOpenPending already have pending signal");
            }
            return await Live.commitCreateSignal(
                symbol, 
                context, 
                { 
                    ...Position.moonbag({
                        position: dto.position,
                        currentPrice,
                        percentStopLoss: config.CC_MAX_STOPLOSS_DISTANCE_PERCENT
                    }),
                    cost: dto.cost,
                    note: dto.note,
                }
            )
        }
        throw new Error("ControlViewService commitOpenPending live target not found");
    }

    public commitAverageBuy = async (
        symbol: string, 
        context: { strategyName: string; exchangeName: string; },
        dto: { cost: number, note: string }
    ) => {
        this.loggerService.log("controlViewService commitAverageBuy", {
            symbol,
            context,
            dto,
        })
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.commitAverageBuy(symbol, context, dto);
        }
        const liveList = await Live.list();
        const liveTarget = liveList.find((live) => live.symbol === symbol);
        if (liveTarget) {
            const currentPrice = await Exchange.getAveragePrice(symbol, {
                exchangeName: liveTarget.exchangeName,
            })
            const pending = await Live.getPendingSignal(symbol, currentPrice, context);
            if (!pending) {
                throw new Error("ControlViewService commitAverageBuy has no pending signal");
            }
            const isOk = await Live.commitAverageBuy(
                symbol,
                currentPrice,
                context,
                dto.cost,
            )
            if (!isOk) {
                throw new Error("ControlViewService commitAverageBuy failed");
            }
            return;
        }
        throw new Error("ControlViewService commitAverageBuy live target not found");
    }

    public commitClosePending = async (
        symbol: string, 
        context: { strategyName: string; exchangeName: string; },
        dto: { note: string }
    ) => {
        this.loggerService.log("controlViewService commitClosePending", {
            symbol,
            context,
            dto,
        })
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.commitClosePending(symbol, context, dto);
        }
        const liveList = await Live.list();
        const liveTarget = liveList.find((live) => live.symbol === symbol);
        if (liveTarget) {
            const currentPrice = await Exchange.getAveragePrice(symbol, {
                exchangeName: liveTarget.exchangeName,
            })
            const pending = await Live.getPendingSignal(symbol, currentPrice, context);
            if (!pending) {
                throw new Error("ControlViewService commitClosePending has no pending signal");
            }
            return await Live.commitClosePending(
                symbol,
                context,
                {
                    id: pending.id,
                    note: dto.note,
                }
            )
        }
        throw new Error("ControlViewService commitClosePending live target not found");
    }

    public commitBreakeven = async (
        symbol: string, 
        context: { strategyName: string; exchangeName: string; },
    ) => {
        this.loggerService.log("controlViewService commitBreakeven", {
            symbol,
            context,
        })
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.commitBreakeven(symbol, context);
        }
        const liveList = await Live.list();
        const liveTarget = liveList.find((live) => live.symbol === symbol);
        if (liveTarget) {
            const currentPrice = await Exchange.getAveragePrice(symbol, {
                exchangeName: liveTarget.exchangeName,
            })
            const pending = await Live.getPendingSignal(symbol, currentPrice, context);
            if (!pending) {
                throw new Error("ControlViewService commitBreakeven has no pending signal");
            }
            const isOk = await Live.commitBreakeven(
                symbol,
                currentPrice,
                context,
            )
            if (!isOk) {
                throw new Error("ControlViewService commitBreakeven failed");
            }
            return;
        }
        throw new Error("ControlViewService commitBreakeven live target not found");
    }
}

export default ControlViewService;
