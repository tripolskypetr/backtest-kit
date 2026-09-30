import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Exchange, Live, Position, getConfig } from "tradeforge";
import ControlMockService from "../mock/ControlMockService";
import { getConfig as getParamsConfig } from "../../../config/params";
import { PauseMockService } from "../mock/PauseMockService";

export class PauseViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly pauseMockService = inject<PauseMockService>(TYPES.pauseMockService);

    public getPaused = async (symbol: string, context: { strategyName: string; exchangeName: string; }) => {
        this.loggerService.log("pauseViewService getStatus", {
            symbol,
            context,
        })
        if (getParamsConfig().CC_ENABLE_MOCK) {
            return await this.pauseMockService.getPaused(symbol, context);
        }
        const liveList = await Live.list();
        const liveTarget = liveList.find((live) => live.symbol === symbol);
        if (liveTarget) {
            return await Live.getPaused(symbol, context);
        }
        throw new Error("PauseViewService getPaused live target not found");
    }

    public setPaused = async (
        symbol: string, 
        context: { strategyName: string; exchangeName: string; },
        paused: boolean,
    ) => {
        this.loggerService.log("pauseViewService setPaused", {
            symbol,
            context,
            paused,
        })
        if (getParamsConfig().CC_ENABLE_MOCK) {
            return await this.pauseMockService.setPaused(symbol, context, paused);
        }
        const liveList = await Live.list();
        const liveTarget = liveList.find((live) => live.symbol === symbol);
        if (liveTarget) {
            return await Live.setPaused(symbol, paused, context);
        }
        throw new Error("PauseViewService setPaused live target not found");
    }
}

export default PauseViewService;
