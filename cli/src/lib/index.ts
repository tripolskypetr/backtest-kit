import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";
import LoggerService from "./services/base/LoggerService";
import PaperMainService from "./services/main/PaperMainService";
import LiveMainService from "./services/main/LiveMainService";
import BacktestMainService from "./services/main/BacktestMainService";
import ExchangeLogicService from "./services/logic/ExchangeLogicService";
import FrameLogicService from "./services/logic/FrameLogicService";
import ResolveService from "./services/base/ResolveService";
import ErrorService from "./services/base/ErrorService";
import SymbolLogicService from "./services/logic/SymbolLogicService";
import FrontendProviderService from "./services/provider/FrontendProviderService";
import TelegramProviderService from "./services/provider/TelegramProviderService";
import CacheLogicService from "./services/logic/CacheLogicService";

const baseServices = {
  errorService: inject<ErrorService>(TYPES.errorService),
  loggerService: inject<LoggerService>(TYPES.loggerService),
  resolveService: inject<ResolveService>(TYPES.resolveService),
};

const mainServices = {
  backtestMainService: inject<BacktestMainService>(TYPES.backtestMainService),
  paperMainService: inject<PaperMainService>(TYPES.paperMainService),
  liveMainService: inject<LiveMainService>(TYPES.liveMainService),
}

const logicServices = {
  exchangeLogicService: inject<ExchangeLogicService>(TYPES.exchangeLogicService),
  symbolLogicService: inject<SymbolLogicService>(TYPES.symbolLogicService),
  frameLogicService: inject<FrameLogicService>(TYPES.frameLogicService),
  cacheLogicService: inject<CacheLogicService>(TYPES.cacheLogicService),
}

const providerServices = {
  frontendProviderService: inject<FrontendProviderService>(TYPES.frontendProviderService),
  telegramProviderService: inject<TelegramProviderService>(TYPES.telegramProviderService),
}

export const cli = {
  ...baseServices,
  ...mainServices,
  ...logicServices,
  ...providerServices,
};

init();

export default cli;
