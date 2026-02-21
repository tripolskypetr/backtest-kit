import LoggerService from "../services/base/LoggerService";
import BacktestMainService from "../services/main/BacktestMainService";
import LiveMainService from "../services/main/LiveMainService";
import PaperMainService from "../services/main/PaperMainService";
import { provide } from "./di";
import TYPES from "./types";

{
    provide(TYPES.loggerService, () => new LoggerService());
}

{
    provide(TYPES.backtestMainService, () => new BacktestMainService());
    provide(TYPES.paperMainService, () => new PaperMainService());
    provide(TYPES.liveMainService, () => new LiveMainService());
}
