import ErrorService from "../services/base/ErrorService";
import LoggerService from "../services/base/LoggerService";
import ResolveService from "../services/base/ResolveService";
import ExchangeSchemaService from "../services/schema/ExchangeSchemaService";
import FrameSchemaService from "../services/schema/FrameSchemaService";
import SymbolSchemaService from "../services/schema/SymbolSchemaService";
import BacktestMainService from "../services/main/BacktestMainService";
import WalkerMainService from "../services/main/WalkerMainService";
import LiveMainService from "../services/main/LiveMainService";
import PaperMainService from "../services/main/PaperMainService";
import FrontendProviderService from "../services/provider/FrontendProviderService";
import TelegramProviderService from "../services/provider/TelegramProviderService";
import { provide } from "./di";
import TYPES from "./types";
import QuickchartApiService from "../services/api/QuickchartApiService";
import TelegramApiService from "../services/api/TelegramApiService";
import TelegramWebService from "../services/web/TelegramWebService";
import CacheLogicService from "../services/logic/CacheLogicService";
import TelegramLogicService from "../services/logic/TelegramLogicService";
import TelegramTemplateService from "../services/template/TelegramTemplateService";
import ModuleConnectionService from "../services/connection/ModuleConnectionService";
import BabelService from "../services/base/BabelService";
import LoaderService from "../services/base/LoaderService";

{
    provide(TYPES.quickchartApiService, () => new QuickchartApiService());
    provide(TYPES.telegramApiService, () => new TelegramApiService());
}

{
    provide(TYPES.errorService, () => new ErrorService());
    provide(TYPES.loggerService, () => new LoggerService());
    provide(TYPES.resolveService, () => new ResolveService());
    provide(TYPES.loaderService, () => new LoaderService());
    provide(TYPES.babelService, () => new BabelService());
}

{
    provide(TYPES.moduleConnectionService, () => new ModuleConnectionService());
}

{
    provide(TYPES.backtestMainService, () => new BacktestMainService());
    provide(TYPES.walkerMainService, () => new WalkerMainService());
    provide(TYPES.paperMainService, () => new PaperMainService());
    provide(TYPES.liveMainService, () => new LiveMainService());
}

{
    provide(TYPES.cacheLogicService, () => new CacheLogicService());
    provide(TYPES.telegramLogicService, () => new TelegramLogicService());
}

{
    provide(TYPES.exchangeSchemaService, () => new ExchangeSchemaService());
    provide(TYPES.symbolSchemaService, () => new SymbolSchemaService());
    provide(TYPES.frameSchemaService, () => new FrameSchemaService());
}

{
    provide(TYPES.telegramProviderService, () => new TelegramProviderService());
    provide(TYPES.frontendProviderService, () => new FrontendProviderService());
}

{
    provide(TYPES.telegramWebService, () => new TelegramWebService());
}

{
    provide(TYPES.telegramTemplateService, () => new TelegramTemplateService());
}
