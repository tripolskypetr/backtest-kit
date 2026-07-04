import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString } from "react-declarative";
import { ttl } from "../../../utils/ttl";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import RuntimeMockService from "../mock/RuntimeMockService";
import { IRuntimeInfo } from "backtest-kit";

const TTL_TIMEOUT = 5_000;

export class RuntimeViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly runtimeMockService = inject<RuntimeMockService>(
        TYPES.runtimeMockService,
    );

    public getRuntimeInfo = ttl(async (): Promise<IRuntimeInfo> => {
        this.loggerService.log("runtimeViewService getRuntimeInfo");
        if (CC_ENABLE_MOCK) {
            return await this.runtimeMockService.getRuntimeInfo();
        }
        const { data, error } = await fetchApi("/api/v1/view/runtime_info", {
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

export default RuntimeViewService;
