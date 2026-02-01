import { fetchApi, inject, randomString } from "react-declarative";
import LoggerService from "../base/LoggerService";
import { CandleInterval, ICandleData } from "backtest-kit";
import TYPES from "../../core/TYPES";
import {
    CC_CLIENT_ID,
    CC_ENABLE_MOCK,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";
import ExchangeMockService from "../mock/ExchangeMockService";

export class ExchangeViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly exchangeMockService = inject<ExchangeMockService>(
        TYPES.exchangeMockService,
    );

    public getSignalCandles = async (
        signalId: string,
        interval: CandleInterval,
    ): Promise<ICandleData> => {
        this.loggerService.log("exchangeViewService getSignalCandles", {
            signalId,
            interval,
        });
        if (CC_ENABLE_MOCK) {
            return await this.exchangeMockService.getSignalCandles(
                signalId,
                interval,
            );
        }
        const { data, error } = await fetchApi("/api/v1/view/candles_signal", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                signalId,
                interval,
            }),
        });
        if (error) {
            throw new Error(error);
        }
        return data;
    };

    public getPointCandles = async (dto: {
        currentTime: number;
        interval: CandleInterval;
        symbol: string;
        exchangeName: string;
    }): Promise<ICandleData> => {
        this.loggerService.log("exchangeViewService getPointCandles", {
            dto,
        });
        if (CC_ENABLE_MOCK) {
            return await this.exchangeMockService.getPointCandles(dto);
        }
        const { data, error } = await fetchApi("/api/v1/view/candles_point", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                ...dto,
            }),
        });
        if (error) {
            throw new Error(error);
        }
        return data;
    };
}

export default ExchangeViewService;
