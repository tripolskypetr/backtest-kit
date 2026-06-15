import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString } from "react-declarative";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import ControlMockService from "../mock/ControlMockService";
import ControlStatusModel from "../../../model/ControlStatus.model";

export class ControlViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly controlMockService = inject<ControlMockService>(
        TYPES.controlMockService,
    );

    public getStrategyStatus = async (
        symbol: string,
        context: { strategyName: string; exchangeName: string },
    ): Promise<ControlStatusModel> => {
        this.loggerService.log("controlViewService getStrategyStatus", { symbol, context });
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.getStrategyStatus(symbol, context);
        }
        const { data, error } = await fetchApi("/api/v1/view/control_status", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                symbol,
                context,
            }),
        });
        if (error) {
            throw new Error(error);
        }
        return data;
    };

    public commitOpenPending = async (
        symbol: string,
        context: { strategyName: string; exchangeName: string },
        dto: { position: "long" | "short"; cost: number; note: string },
    ): Promise<void> => {
        this.loggerService.log("controlViewService commitOpenPending", {
            symbol,
            context,
            dto,
        });
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.commitOpenPending(symbol, context, dto);
        }
        const { error } = await fetchApi("/api/v1/view/control_open_pending", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                symbol,
                context,
                dto,
            }),
        });
        if (error) {
            throw new Error(error);
        }
    };

    public commitAverageBuy = async (
        symbol: string,
        context: { strategyName: string; exchangeName: string },
        dto: { cost: number; note: string },
    ): Promise<void> => {
        this.loggerService.log("controlViewService commitAverageBuy", {
            symbol,
            context,
            dto,
        });
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.commitAverageBuy(symbol, context, dto);
        }
        const { error } = await fetchApi("/api/v1/view/control_average_buy", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                symbol,
                context,
                dto,
            }),
        });
        if (error) {
            throw new Error(error);
        }
    };

    public commitClosePending = async (
        symbol: string,
        context: { strategyName: string; exchangeName: string },
        dto: { note: string },
    ): Promise<void> => {
        this.loggerService.log("controlViewService commitClosePending", {
            symbol,
            context,
            dto,
        });
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.commitClosePending(symbol, context, dto);
        }
        const { error } = await fetchApi("/api/v1/view/control_close_pending", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                symbol,
                context,
                dto,
            }),
        });
        if (error) {
            throw new Error(error);
        }
    };

    public commitBreakeven = async (
        symbol: string,
        context: { strategyName: string; exchangeName: string },
    ): Promise<void> => {
        this.loggerService.log("controlViewService commitBreakeven", {
            symbol,
            context,
        });
        if (CC_ENABLE_MOCK) {
            return await this.controlMockService.commitBreakeven(symbol, context);
        }
        const { error } = await fetchApi("/api/v1/view/control_breakeven", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                symbol,
                context,
            }),
        });
        if (error) {
            throw new Error(error);
        }
    };
}

export default ControlViewService;
