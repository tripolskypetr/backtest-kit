import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString, ttl } from "react-declarative";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import StatusMockService from "../mock/StatusMockService";
import StatusModel from "../../../model/Status.model";
import StatusInfoModel from "../../../model/StatusInfo.model";

const TTL_TIMEOUT = 45_000;

export class StatusViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly statusMockService = inject<StatusMockService>(
        TYPES.statusMockService,
    );

    public getStatusList = async () => {
        this.loggerService.log("statusViewService getStatusList");
        if (CC_ENABLE_MOCK) {
            return await this.statusMockService.getStatusList();
        }
        const { data, error } = await fetchApi("/api/v1/view/status_list", {
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
    };

    public getStatusMap = async () => {
        this.loggerService.log("statusViewService getStatusMap");
        if (CC_ENABLE_MOCK) {
            return await this.statusMockService.getStatusMap();
        }
        const list = await this.getStatusList();
        return (list as { id: string }[]).reduce(
            (acm, cur) => ({ ...acm, [cur.id]: cur }),
            {},
        );
    };

    public getStatusOne = async (id: string): Promise<StatusModel | null> => {
        this.loggerService.log("statusViewService getStatusOne", { id });
        if (CC_ENABLE_MOCK) {
            return await this.statusMockService.getStatusOne(id);
        }
        const { data, error } = await fetchApi(
            `/api/v1/view/status_one/${id}`,
            {
                method: "POST",
                body: JSON.stringify({
                    clientId: CC_CLIENT_ID,
                    serviceName: CC_SERVICE_NAME,
                    userId: CC_USER_ID,
                    requestId: randomString(),
                }),
            },
        );
        if (error) {
            throw new Error(error);
        }
        return data;
    };

    public getStatusInfo = ttl(async (): Promise<StatusInfoModel> => {
        this.loggerService.log("statusViewService getStatusInfo");
        if (CC_ENABLE_MOCK) {
            return await this.statusMockService.getStatusInfo();
        }
        const { data, error } = await fetchApi("/api/v1/view/status_info", {
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

export default StatusViewService;
