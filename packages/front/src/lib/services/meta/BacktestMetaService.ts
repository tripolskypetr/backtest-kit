import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Backtest } from "backtest-kit";
import { CC_ENABLE_MOCK } from "../../../config/params";

const BACKTEST_LIST = [
  { id: "mock-backtest-1", symbol: "BTCUSDT", strategyName: "mock-strategy", exchangeName: "binance", frameName: "1m", status: "done" },
  { id: "mock-backtest-2", symbol: "ETHUSDT", strategyName: "mock-strategy", exchangeName: "binance", frameName: "1m", status: "running" },
  { id: "mock-backtest-3", symbol: "BNBUSDT", strategyName: "mock-strategy", exchangeName: "binance", frameName: "1m", status: "idle" },
];

export class BacktestMetaService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public list = async () => {
        this.loggerService.log("backtestMetaService list");
        if (CC_ENABLE_MOCK) {
            return BACKTEST_LIST;
        }
        return await Backtest.list();
    }
}

export default BacktestMetaService;
