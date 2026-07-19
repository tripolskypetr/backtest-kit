import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString } from "react-declarative";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import PauseMockService from "../mock/PauseMockService";

export class PauseViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly pauseMockService = inject<PauseMockService>(
        TYPES.pauseMockService,
    );

    public getPaused = async (
        symbol: string,
        context: { strategyName: string; exchangeName: string },
    ): Promise<boolean> => {
        this.loggerService.log("pauseViewService getPaused", { symbol, context });
        if (CC_ENABLE_MOCK) {
            return await this.pauseMockService.getPaused(symbol, context);
        }
        const { data, error } = await fetchApi("/api/v1/view/pause_status", {
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

    public setPaused = async (
        symbol: string,
        context: { strategyName: string; exchangeName: string },
        paused: boolean,
    ): Promise<void> => {
        this.loggerService.log("pauseViewService setPaused", {
            symbol,
            context,
            paused,
        });
        if (CC_ENABLE_MOCK) {
            return await this.pauseMockService.setPaused(symbol, context, paused);
        }
        const { error } = await fetchApi("/api/v1/view/pause_set", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                symbol,
                context,
                paused,
            }),
        });
        if (error) {
            throw new Error(error);
        }
    };
}

export default PauseViewService;
