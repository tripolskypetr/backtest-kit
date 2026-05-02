import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString, ttl } from "react-declarative";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import EnvironmentMockService, { EnvironmentData } from "../mock/EnvironmentMockService";

const TTL_TIMEOUT = 45_000;

export class EnvironmentViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly environmentMockService = inject<EnvironmentMockService>(
        TYPES.environmentMockService,
    );

    public getEnvironmentData = ttl(async (): Promise<EnvironmentData> => {
        this.loggerService.log("environmentViewService getEnvironmentData");
        if (CC_ENABLE_MOCK) {
            return await this.environmentMockService.getEnvironmentData();
        }
        const { data, error } = await fetchApi("/api/v1/view/environment_data", {
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

export default EnvironmentViewService;
