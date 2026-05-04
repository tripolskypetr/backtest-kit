import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString, ttl } from "react-declarative";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import SetupMockService, { SetupData } from "../mock/SetupMockService";

const TTL_TIMEOUT = 45_000;

export class SetupViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly setupMockService = inject<SetupMockService>(
        TYPES.setupMockService,
    );

    public getSetupData = ttl(async (): Promise<SetupData> => {
        this.loggerService.log("setupViewService getSetupData");
        if (CC_ENABLE_MOCK) {
            return await this.setupMockService.getSetupData();
        }
        const { data, error } = await fetchApi("/api/v1/view/setup_data", {
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

export default SetupViewService;
