import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";

export class PauseMockService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    _isPaused = false;

    public getPaused = async (symbol: string, context: { strategyName: string; exchangeName: string; }) => {
        this.loggerService.log("pauseMockService getPaused", {
            symbol,
            context,
        })
        return this._isPaused;
    }

    public setPaused = async (
        symbol: string, 
        context: { strategyName: string; exchangeName: string; },
        paused: boolean,
    ) => {
        this.loggerService.log("pauseMockService setPaused", {
            symbol,
            context,
            paused,
        })
        this._isPaused = paused;
    }
}

export default PauseMockService;
