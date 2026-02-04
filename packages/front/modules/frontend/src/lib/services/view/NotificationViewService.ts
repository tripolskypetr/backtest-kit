import { NotificationModel } from "backtest-kit";

import LoggerService from "../base/LoggerService";
import {
    fetchApi,
    inject,
    randomString,
    pickDocuments,
} from "react-declarative";
import TYPES from "../../core/TYPES";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import NotificationMockService from "../mock/NotificationMockService";

const DEFAULT_LIMIT = 25;
const DEFAULT_OFFSET = 0;

const CREATE_FILTER_LIST_FN = <T extends object = Record<string, string>>(
    filterData: T,
) =>
    Object.keys(filterData).map(
        (key) => (row) => new RegExp(filterData[key], "i").test(row[key]),
    );

export class NotificationViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly notificationMockService = inject<NotificationMockService>(
        TYPES.notificationMockService,
    );

    public findByFilter = async <T extends object = Record<string, string>>(
        filterData: T,
        limit = DEFAULT_LIMIT,
        offset = DEFAULT_OFFSET,
    ) => {
        this.loggerService.log("notificationViewService findByFilter", {
            filterData,
            limit,
            offset,
        });
        if (CC_ENABLE_MOCK) {
            return await this.notificationMockService.findByFilter(
                filterData,
                limit,
                offset,
            );
        }
        const iter = pickDocuments<NotificationModel>(limit, offset);
        const filterList = CREATE_FILTER_LIST_FN<T>(filterData);
        for (const notification of await this.getList()) {
            let isOk = true;
            for (const filterFn of filterList) {
                isOk = isOk && filterFn(notification);
            }
            if (!isOk) {
                continue;
            }
            if (iter([notification]).done) {
                break;
            }
        }
        return iter().rows;
    };

    public getList = async (): Promise<NotificationModel[]> => {
        this.loggerService.log("notificationViewService getList");
        if (CC_ENABLE_MOCK) {
            return await this.notificationMockService.getList();
        }
        const { data, error } = await fetchApi(
            "/api/v1/view/notification_list",
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
        this.loggerService.log("notificationViewService getOne", { id });
        if (CC_ENABLE_MOCK) {
            return await this.notificationMockService.getOne(id);
        }
        const { data, error } = await fetchApi(
            `/api/v1/view/notification_one/${id}`,
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
}

export default NotificationViewService;
