import { fetchApi, inject, randomString } from "react-declarative";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import {
    CC_CLIENT_ID,
    CC_SERVICE_NAME,
    CC_USER_ID,
} from "../../../config/params";

interface ISymbolData {
    icon: string;
    logo: string;
    symbol: string;
    displayName: string;
    color: string;
    priority: number;
    description: string;
    index: number;
}

type Pair = string;

export class SymbolGlobalService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public getSymbolList = async (): Promise<Pair[]> => {
        this.loggerService.log("symbolGlobalService getSymbolList");
        const { data, error } = await fetchApi("/api/v1/dict/symbol/list", {
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

    public getSymbolMap = async (): Promise<Record<Pair, ISymbolData>> => {
        this.loggerService.log("symbolGlobalService getSymbolMap");
        const { data, error } = await fetchApi("/api/v1/dict/symbol/map", {
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

    public getSymbol = async (symbol: Pair): Promise<ISymbolData> => {
        this.loggerService.log("symbolGlobalService getSymbol", { symbol });
        const { data, error } = await fetchApi("/api/v1/dict/symbol/one", {
            method: "POST",
            body: JSON.stringify({
                clientId: CC_CLIENT_ID,
                serviceName: CC_SERVICE_NAME,
                userId: CC_USER_ID,
                requestId: randomString(),
                id: symbol,
            }),
        });
        if (error) {
            throw new Error(error);
        }
        return data;
    };
}

export default SymbolGlobalService;
