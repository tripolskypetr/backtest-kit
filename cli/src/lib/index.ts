import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";
import LoggerService from "./services/base/LoggerService";
import PaperMainService from "./services/main/PaperMainService";
import LiveMainService from "./services/main/LiveMainService";
import BacktestMainService from "./services/main/BacktestMainService";
import ExchangeSchemaService from "./services/schema/ExchangeSchemaService";
import FrameSchemaService from "./services/schema/FrameSchemaService";
import ResolveService from "./services/base/ResolveService";
import ErrorService from "./services/base/ErrorService";
import SymbolSchemaService from "./services/schema/SymbolSchemaService";
import FrontendProviderService from "./services/provider/FrontendProviderService";
import TelegramProviderService from "./services/provider/TelegramProviderService";
import CacheLogicService from "./services/logic/CacheLogicService";
import TelegramApiService from "./services/api/TelegramApiService";
import QuickchartApiService from "./services/api/QuickchartApiService";
import TelegramWebService from "./services/web/TelegramWebService";
import TelegramLogicService from "./services/logic/TelegramLogicService";
import TelegramTemplateService from "./services/template/TelegramTemplateService";
import ModuleConnectionService from "./services/connection/ModuleConnectionService";
import LiveProviderService from "./services/provider/LiveProviderService";

const apiServices = {
  telegramApiService: inject<TelegramApiService>(TYPES.telegramApiService),
  quickchartApiService: inject<QuickchartApiService>(TYPES.quickchartApiService),
};

const baseServices = {
  errorService: inject<ErrorService>(TYPES.errorService),
  loggerService: inject<LoggerService>(TYPES.loggerService),
  resolveService: inject<ResolveService>(TYPES.resolveService),
};

const connectionServices = {
  moduleConnectionService: inject<ModuleConnectionService>(TYPES.moduleConnectionService),
};

const mainServices = {
  backtestMainService: inject<BacktestMainService>(TYPES.backtestMainService),
  paperMainService: inject<PaperMainService>(TYPES.paperMainService),
  liveMainService: inject<LiveMainService>(TYPES.liveMainService),
}

const logicServices = {
  cacheLogicService: inject<CacheLogicService>(TYPES.cacheLogicService),
  telegramLogicService: inject<TelegramLogicService>(TYPES.telegramLogicService),
}

const schemaServices = {
  exchangeSchemaService: inject<ExchangeSchemaService>(TYPES.exchangeSchemaService),
  symbolSchemaService: inject<SymbolSchemaService>(TYPES.symbolSchemaService),
  frameSchemaService: inject<FrameSchemaService>(TYPES.frameSchemaService),
}

const providerServices = {
  frontendProviderService: inject<FrontendProviderService>(TYPES.frontendProviderService),
  telegramProviderService: inject<TelegramProviderService>(TYPES.telegramProviderService),
  liveProviderService: inject<LiveProviderService>(TYPES.liveProviderService),
}

const webServices = {
  telegramWebService: inject<TelegramWebService>(TYPES.telegramWebService),
}

const templateServices = {
  telegramTemplateService: inject<TelegramTemplateService>(TYPES.telegramTemplateService),
}

export const cli = {
  ...apiServices,
  ...baseServices,
  ...connectionServices,
  ...mainServices,
  ...logicServices,
  ...schemaServices,
  ...providerServices,
  ...webServices,
  ...templateServices,
};

init();

export default cli;
