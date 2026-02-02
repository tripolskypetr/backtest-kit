import { IStorageSignalRow } from "backtest-kit";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString } from "react-declarative";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import StorageMockService from "../mock/StorageMockService";

export class StorageViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly storageMockService = inject<StorageMockService>(
        TYPES.storageMockService,
    );

    public findSignalById = async (
        signalId: string,
    ): Promise<IStorageSignalRow | null> => {
        this.loggerService.log("storageViewService findSignalById", {
            signalId,
        });
        if (CC_ENABLE_MOCK) {
            return await this.storageMockService.findSignalById(signalId);
        }
        const { data, error } = await fetchApi(
            `/api/v1/view/storage_one/${signalId}`,
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

    public listSignalLive = async (): Promise<IStorageSignalRow[]> => {
        this.loggerService.log("storageViewService listSignalLive");
        if (CC_ENABLE_MOCK) {
            return await this.storageMockService.listSignalLive();
        }
        const { data, error } = await fetchApi(
            "/api/v1/view/storage_list/live",
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

    public listSignalBacktest = async (): Promise<IStorageSignalRow[]> => {
        this.loggerService.log("storageViewService listSignalBacktest");
        if (CC_ENABLE_MOCK) {
            return await this.storageMockService.listSignalBacktest();
        }
        const { data, error } = await fetchApi(
            "/api/v1/view/storage_list/backtest",
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

export default StorageViewService;
