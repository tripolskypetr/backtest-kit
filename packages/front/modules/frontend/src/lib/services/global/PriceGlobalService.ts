import { fetchApi, inject, randomString } from "react-declarative";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import {
    CC_CLIENT_ID,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";

export class PriceGlobalService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public getSignalPendingPrice = async (
        symbol: string,
        strategyName: string,
        exchangeName: string,
        frameName: string,
        backtest: boolean,
    ): Promise<number> => {
        this.loggerService.log("priceGlobalService getSignalPendingPrice", {
            symbol,
            strategyName,
            exchangeName,
            frameName,
            backtest,
        });
        const { data, error } = await fetchApi("/api/v1/global/signal_pending_price", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                symbol,
                strategyName,
                exchangeName,
                frameName,
                backtest,
            }),
        });
        if (error) {
            throw new Error(error);
        }
        return data;
    };
}

export default PriceGlobalService;
