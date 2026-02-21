import LoggerService from "../services/base/LoggerService";
import ResolveService from "../services/base/ResolveService";
import ExchangeLogicService from "../services/logic/ExchangeLogicService";
import FrameLogicService from "../services/logic/FrameLogicService";
import BacktestMainService from "../services/main/BacktestMainService";
import LiveMainService from "../services/main/LiveMainService";
import PaperMainService from "../services/main/PaperMainService";
import { provide } from "./di";
import TYPES from "./types";

{
    provide(TYPES.loggerService, () => new LoggerService());
    provide(TYPES.resolveService, () => new ResolveService());
}

{
    provide(TYPES.backtestMainService, () => new BacktestMainService());
    provide(TYPES.paperMainService, () => new PaperMainService());
    provide(TYPES.liveMainService, () => new LiveMainService());
}

{
    provide(TYPES.exchangeLogicService, () => new ExchangeLogicService());
    provide(TYPES.frameLogicService, () => new FrameLogicService());
}
