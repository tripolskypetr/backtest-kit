import { fetchApi, inject, randomString } from "react-declarative";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import {
    CC_CLIENT_ID,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";

export class LiveGlobalService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public list = async () => {
        this.loggerService.log("liveGlobalService list");
        const { data, error } = await fetchApi("/api/v1/global/live_list", {
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

export default LiveGlobalService;
