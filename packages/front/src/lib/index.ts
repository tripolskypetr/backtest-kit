import "./core/provide";

import { init, inject } from "./core/di";
import { TYPES } from "./core/types";
import LoggerService from "./services/base/LoggerService";
import ExchangeService from "./services/base/ExchangeService";
import NotificationMockService from "./services/mock/NotificationMockService";
import StorageMockService from "./services/mock/StorageMockService";
import ExchangeMockService from "./services/mock/ExchangeMockService";
import LogMockService from "./services/mock/LogMockService";
import StatusMockService from "./services/mock/StatusMockService";
import MarkdownMockService from "./services/mock/MarkdownMockService";
import ExplorerMockService from "./services/mock/ExplorerMockService";
import SignalMockService from "./services/mock/SignalMockService";
import HeatMockService from "./services/mock/HeatMockService";
import NotificationViewService from "./services/view/NotificationViewService";
import StatusViewService from "./services/view/StatusViewService";
import StorageViewService from "./services/view/StorageViewService";
import ExchangeViewService from "./services/view/ExchangeViewService";
import LogViewService from "./services/view/LogViewService";
import MarkdownViewService from "./services/view/MarkdownViewService";
import ExplorerViewService from "./services/view/ExplorerViewService";
import SignalViewService from "./services/view/SignalViewService";
import HeatViewService from "./services/view/HeatViewService";
import SymbolConnectionService from "./services/connection/SymbolConnectionService";
import SymbolMetaService from "./services/meta/SymbolMetaService";
import PriceConnectionService from "./services/connection/PriceConnectionService";
import LiveMetaService from "./services/meta/LiveMetaService";
import BacktestMetaService from "./services/meta/BacktestMetaService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
  exchangeService: inject<ExchangeService>(TYPES.exchangeService),
};

const connectionServices = {
  symbolConnectionService: inject<SymbolConnectionService>(TYPES.symbolConnectionService),
  priceConnectionService: inject<PriceConnectionService>(TYPES.priceConnectionService),
}

const metaServices = {
  liveMetaService: inject<LiveMetaService>(TYPES.liveMetaService),
  symbolMetaService: inject<SymbolMetaService>(TYPES.symbolMetaService),
  backtestMetaService: inject<BacktestMetaService>(TYPES.backtestMetaService),
}

const mockServices = {
  notificationMockService: inject<NotificationMockService>(TYPES.notificationMockService),
  storageMockService: inject<StorageMockService>(TYPES.storageMockService),
  exchangeMockService: inject<ExchangeMockService>(TYPES.exchangeMockService),
  logMockService: inject<LogMockService>(TYPES.logMockService),
  statusMockService: inject<StatusMockService>(TYPES.statusMockService),
  markdownMockService: inject<MarkdownMockService>(TYPES.markdownMockService),
  explorerMockService: inject<ExplorerMockService>(TYPES.explorerMockService),
  signalMockService: inject<SignalMockService>(TYPES.signalMockService),
  heatMockService: inject<HeatMockService>(TYPES.heatMockService),
};

const viewServices = {
  notificationViewService: inject<NotificationViewService>(TYPES.notificationViewService),
  storageViewService: inject<StorageViewService>(TYPES.storageViewService),
  exchangeViewService: inject<ExchangeViewService>(TYPES.exchangeViewService),
  logViewService: inject<LogViewService>(TYPES.logViewService),
  statusViewService: inject<StatusViewService>(TYPES.statusViewService),
  markdownViewService: inject<MarkdownViewService>(TYPES.markdownViewService),
  explorerViewService: inject<ExplorerViewService>(TYPES.explorerViewService),
  signalViewService: inject<SignalViewService>(TYPES.signalViewService),
  heatViewService: inject<HeatViewService>(TYPES.heatViewService),
};

const ioc = {
  ...baseServices,
  ...connectionServices,
  ...metaServices,
  ...mockServices,
  ...viewServices,
};

init();

export { ioc };

export default ioc;
