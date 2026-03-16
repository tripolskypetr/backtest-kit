import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString } from "react-declarative";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import SignalMockService from "../mock/SignalMockService";

export class SignalViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly signalMockService = inject<SignalMockService>(
        TYPES.signalMockService,
    );

    public getLastUpdateTimestamp = async (signalId: string): Promise<number> => {
        this.loggerService.log("signalViewService getLastUpdateTimestamp", {
            signalId,
        });
        if (CC_ENABLE_MOCK) {
            return await this.signalMockService.getLastUpdateTimestamp(signalId);
        }
        const { data, error } = await fetchApi(
            `/api/v1/view/signal_last_update/${signalId}`,
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

export default SignalViewService;
