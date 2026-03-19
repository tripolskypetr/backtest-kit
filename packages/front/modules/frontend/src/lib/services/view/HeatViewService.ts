import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString, ttl } from "react-declarative";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import HeatMockService from "../mock/HeatMockService";
import { HeatmapStatisticsModel } from "backtest-kit";

const TTL_TIMEOUT = 45_000;

export class HeatViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly heatMockService = inject<HeatMockService>(
        TYPES.heatMockService,
    );

    public getStrategyHeat = ttl(async (): Promise<HeatmapStatisticsModel> => {
        this.loggerService.log("heatViewService getStrategyHeat");
        if (CC_ENABLE_MOCK) {
            return await this.heatMockService.getStrategyHeat();
        }
        const { data, error } = await fetchApi("/api/v1/view/heat", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
            }),
        });
        if (error) {
            throw new Error(error);
        }
        return data;
    }, {
        timeout: TTL_TIMEOUT,
    });
}

export default HeatViewService;
