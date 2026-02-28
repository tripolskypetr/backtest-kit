import { ILogEntry } from "backtest-kit";

import LoggerService from "../base/LoggerService";
import {
    fetchApi,
    inject,
    randomString,
} from "react-declarative";
import TYPES from "../../core/TYPES";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import LogMockService from "../mock/LogMockService";

export class LogViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly logMockService = inject<LogMockService>(
        TYPES.logMockService,
    );

    public getList = async (): Promise<ILogEntry[]> => {
        this.loggerService.log("logViewService getList");
        if (CC_ENABLE_MOCK) {
            return await this.logMockService.getList();
        }
        const { data, error } = await fetchApi(
            "/api/v1/view/log_list",
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

    public getOne = async (id: string): Promise<ILogEntry | null> => {
        this.loggerService.log("logViewService getOne", { id });
        if (CC_ENABLE_MOCK) {
            return await this.logMockService.getOne(id);
        }
        const { data, error } = await fetchApi(
            `/api/v1/view/log_one/${id}`,
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
    ): Promise<ILogEntry[]> => {
        this.loggerService.log("logViewService findByFilter", { filterData, limit, offset });
        if (CC_ENABLE_MOCK) {
            return await this.logMockService.findByFilter(filterData, limit, offset);
        }
        const { data, error } = await fetchApi(
            "/api/v1/view/log_filter",
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

export default LogViewService;
