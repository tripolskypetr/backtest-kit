import ErrorService from "../services/base/ErrorService";
import LoggerService from "../services/base/LoggerService";
import ResolveService from "../services/base/ResolveService";
import ExchangeLogicService from "../services/logic/ExchangeLogicService";
import FrameLogicService from "../services/logic/FrameLogicService";
import SymbolLogicService from "../services/logic/SymbolLogicService";
import BacktestMainService from "../services/main/BacktestMainService";
import LiveMainService from "../services/main/LiveMainService";
import PaperMainService from "../services/main/PaperMainService";
import FrontendProviderService from "../services/provider/FrontendProviderService";
import TelegramProviderService from "../services/provider/TelegramProviderService";
import { provide } from "./di";
import TYPES from "./types";

{
    provide(TYPES.errorService, () => new ErrorService());
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
    provide(TYPES.symbolLogicService, () => new SymbolLogicService());
    provide(TYPES.frameLogicService, () => new FrameLogicService());
}

{
    provide(TYPES.telegramProviderService, () => new TelegramProviderService());
    provide(TYPES.frontendProviderService, () => new FrontendProviderService());
}
