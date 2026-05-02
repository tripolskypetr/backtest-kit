import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString, ttl } from "react-declarative";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import PerformanceMockService from "../mock/PerformanceMockService";
import { PerformanceStatisticsModel } from "backtest-kit";

const TTL_TIMEOUT = 45_000;

export class PerformanceViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly performanceMockService = inject<PerformanceMockService>(
        TYPES.performanceMockService,
    );

    public getPerformanceData = ttl(async (): Promise<PerformanceStatisticsModel> => {
        this.loggerService.log("performanceViewService getPerformanceData");
        if (CC_ENABLE_MOCK) {
            return await this.performanceMockService.getPerformanceData();
        }
        const { data, error } = await fetchApi("/api/v1/view/performance_data", {
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

    public getPerformanceReport = ttl(async (): Promise<string> => {
        this.loggerService.log("performanceViewService getPerformanceReport");
        if (CC_ENABLE_MOCK) {
            return await this.performanceMockService.getPerformanceReport();
        }
        const { data, error } = await fetchApi("/api/v1/view/performance_report", {
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

export default PerformanceViewService;
