import { fetchApi, inject, randomString, singleshot } from "react-declarative";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import {
    CC_CLIENT_ID,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";

export class ReplGlobalService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public eval = async (command: string): Promise<string | null> => {
        this.loggerService.log("replGlobalService eval", {
            command,
        });
        const { data, error } = await fetchApi("/api/v1/repl/eval", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                data: {
                    command,
                },
            }),
        });
        if (error) {
            console.error(error);
            return null;
        }
        console.log(data);
        return data;
    };

    protected prefetch = singleshot(() => {
        this.loggerService.log("replGlobalService prefetch");
        Object.assign(globalThis, { replEval: this.eval });
    });
}

export default ReplGlobalService;
