import { NotificationModel } from "backtest-kit";

import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import NotificationMockService from "../mock/NotificationMockService";

export class NotificationViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly notificationMockService = inject<NotificationMockService>(
        TYPES.notificationMockService,
    );

    public getData = async (): Promise<NotificationModel> => {
        this.loggerService.log("notificationViewService getData");
        if (CC_ENABLE_MOCK) {
            return await this.notificationMockService.getData();
        }
        const { data, error } = await fetchApi("/api/v1/view/notification", {
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
}

export default NotificationViewService;
