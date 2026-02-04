import {
    fetchApi,
    inject,
    randomString,
} from "react-declarative";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { NotificationModel } from "backtest-kit";
import {
    CC_CLIENT_ID,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";

export class NotificationMockService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public getList = async (): Promise<NotificationModel[]> => {
        this.loggerService.log("notificationMockService getList");
        const { data, error } = await fetchApi(
            "/api/v1/mock/notification_list",
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

    public getOne = async (id: string): Promise<NotificationModel | null> => {
        this.loggerService.log("notificationMockService getOne", { id });
        const { data, error } = await fetchApi(
            `/api/v1/mock/notification_one/${id}`,
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

    public findByFilter = async <T extends object = Record<string, string>>(
        filterData: T,
        limit?: number,
        offset?: number,
    ): Promise<NotificationModel[]> => {
        this.loggerService.log("notificationMockService findByFilter", { filterData, limit, offset });
        const { data, error } = await fetchApi(
            "/api/v1/mock/notification_filter",
            {
                method: "POST",
                body: JSON.stringify({
                    clientId: CC_CLIENT_ID,
                    serviceName: CC_SERVICE_NAME,
                    userId: CC_USER_ID,
                    requestId: randomString(),
                    filterData,
                    limit,
                    offset,
                }),
            },
        );
        if (error) {
            throw new Error(error);
        }
        return data;
    };
}

export default NotificationMockService;
