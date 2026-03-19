import ExchangeService from "../services/base/ExchangeService";
import LoggerService from "../services/base/LoggerService";
import NotificationMockService from "../services/mock/NotificationMockService";
import StorageMockService from "../services/mock/StorageMockService";
import ExchangeMockService from "../services/mock/ExchangeMockService";
import LogMockService from "../services/mock/LogMockService";
import StatusMockService from "../services/mock/StatusMockService";
import MarkdownMockService from "../services/mock/MarkdownMockService";
import ExplorerMockService from "../services/mock/ExplorerMockService";
import SignalMockService from "../services/mock/SignalMockService";
import HeatMockService from "../services/mock/HeatMockService";
import NotificationViewService from "../services/view/NotificationViewService";
import StorageViewService from "../services/view/StorageViewService";
import ExchangeViewService from "../services/view/ExchangeViewService";
import LogViewService from "../services/view/LogViewService";
import StatusViewService from "../services/view/StatusViewService";
import MarkdownViewService from "../services/view/MarkdownViewService";
import ExplorerViewService from "../services/view/ExplorerViewService";
import SignalViewService from "../services/view/SignalViewService";
import HeatViewService from "../services/view/HeatViewService";
import { provide } from "./di";
import { TYPES } from "./types";
import SymbolConnectionService from "../services/connection/SymbolConnectionService";
import SymbolMetaService from "../services/meta/SymbolMetaService";
import PriceConnectionService from "../services/connection/PriceConnectionService";
import BacktestMetaService from "../services/meta/BacktestMetaService";
import LiveMetaService from "../services/meta/LiveMetaService";

{
  provide(TYPES.loggerService, () => new LoggerService());
  provide(TYPES.exchangeService, () => new ExchangeService());
}

{
  provide(TYPES.symbolConnectionService, () => new SymbolConnectionService());
  provide(TYPES.priceConnectionService, () => new PriceConnectionService());
}

{
  provide(TYPES.liveMetaService, () => new LiveMetaService());
  provide(TYPES.symbolMetaService, () => new SymbolMetaService());
  provide(TYPES.backtestMetaService, () => new BacktestMetaService());
}

{
  provide(TYPES.notificationMockService, () => new NotificationMockService());
  provide(TYPES.storageMockService, () => new StorageMockService());
  provide(TYPES.exchangeMockService, () => new ExchangeMockService());
  provide(TYPES.logMockService, () => new LogMockService());
  provide(TYPES.statusMockService, () => new StatusMockService());
  provide(TYPES.markdownMockService, () => new MarkdownMockService());
  provide(TYPES.explorerMockService, () => new ExplorerMockService());
  provide(TYPES.signalMockService, () => new SignalMockService());
  provide(TYPES.heatMockService, () => new HeatMockService());
}

{
 provide(TYPES.notificationViewService, () => new NotificationViewService());
 provide(TYPES.storageViewService, () => new StorageViewService());
 provide(TYPES.exchangeViewService, () => new ExchangeViewService());
 provide(TYPES.logViewService, () => new LogViewService());
 provide(TYPES.statusViewService, () => new StatusViewService());
 provide(TYPES.markdownViewService, () => new MarkdownViewService());
 provide(TYPES.explorerViewService, () => new ExplorerViewService());
 provide(TYPES.signalViewService, () => new SignalViewService());
 provide(TYPES.heatViewService, () => new HeatViewService());
}
