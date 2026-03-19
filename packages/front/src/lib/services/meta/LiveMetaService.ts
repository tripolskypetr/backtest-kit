import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Live } from "backtest-kit";
import { CC_ENABLE_MOCK } from "../../../config/params";

const LIVE_LIST = [
  { id: "mock-live-1", symbol: "BTCUSDT", strategyName: "mock-strategy", exchangeName: "binance", status: "running" },
  { id: "mock-live-2", symbol: "ETHUSDT", strategyName: "mock-strategy", exchangeName: "binance", status: "idle" },
];

export class LiveMetaService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public list = async () => {
        this.loggerService.log("liveMetaService list");
        if (CC_ENABLE_MOCK) {
            return LIVE_LIST;
        }
        return await Live.list();
    }
}

export default LiveMetaService;
