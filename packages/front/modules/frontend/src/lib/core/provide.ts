import { provide } from "react-declarative";
import TYPES from "./TYPES";

import ErrorService from "../services/base/ErrorService";
import LayoutService from "../services/base/LayoutService";
import LoggerService from "../services/base/LoggerService";
import RouterService from "../services/base/RouterService";
import AlertService from "../services/base/AlertService";

import ExchangeMockService from "../services/mock/ExchangeMockService";
import NotificationMockService from "../services/mock/NotificationMockService";
import StorageMockService from "../services/mock/StorageMockService";
import LogMockService from "../services/mock/LogMockService";
import StatusMockService from "../services/mock/StatusMockService";
import MarkdownMockService from "../services/mock/MarkdownMockService";
import ExplorerMockService from "../services/mock/ExplorerMockService";
import SignalMockService from "../services/mock/SignalMockService";

import ExchangeViewService from "../services/view/ExchangeViewService";
import NotificationViewService from "../services/view/NotificationViewService";
import StorageViewService from "../services/view/StorageViewService";
import LogViewService from "../services/view/LogViewService";
import StatusViewService from "../services/view/StatusViewService";
import MarkdownViewService from "../services/view/MarkdownViewService";
import ExplorerViewService from "../services/view/ExplorerViewService";
import SignalViewService from "../services/view/SignalViewService";
import SymbolGlobalService from "../services/global/SymbolGlobalService";
import PriceGlobalService from "../services/global/PriceGlobalService";
import BacktestGlobalService from "../services/global/BacktestGlobalService";
import LiveGlobalService from "../services/global/LiveGlobalService";
import ExplorerHelperService from "../services/helpers/ExplorerHelperService";

{
    provide(TYPES.errorService, () => new ErrorService());
    provide(TYPES.alertService, () => new AlertService());
    provide(TYPES.layoutService, () => new LayoutService());
    provide(TYPES.loggerService, () => new LoggerService());
    provide(TYPES.routerService, () => new RouterService());
}

{
    provide(TYPES.symbolGlobalService, () => new SymbolGlobalService());
    provide(TYPES.priceGlobalService, () => new PriceGlobalService());
    provide(TYPES.backtestGlobalService, () => new BacktestGlobalService());
    provide(TYPES.liveGlobalService, () => new LiveGlobalService());
}

{
    provide(TYPES.explorerHelperService, () => new ExplorerHelperService());
}

{
    provide(TYPES.exchangeMockService, () => new ExchangeMockService());
    provide(TYPES.notificationMockService, () => new NotificationMockService());
    provide(TYPES.storageMockService, () => new StorageMockService());
    provide(TYPES.logMockService, () => new LogMockService());
    provide(TYPES.statusMockService, () => new StatusMockService());
    provide(TYPES.markdownMockService, () => new MarkdownMockService());
    provide(TYPES.explorerMockService, () => new ExplorerMockService());
    provide(TYPES.signalMockService, () => new SignalMockService());
}

{
    provide(TYPES.exchangeViewService, () => new ExchangeViewService());
    provide(TYPES.notificationViewService, () => new NotificationViewService());
    provide(TYPES.storageViewService, () => new StorageViewService());
    provide(TYPES.logViewService, () => new LogViewService());
    provide(TYPES.statusViewService, () => new StatusViewService());
    provide(TYPES.markdownViewService, () => new MarkdownViewService());
    provide(TYPES.explorerViewService, () => new ExplorerViewService());
    provide(TYPES.signalViewService, () => new SignalViewService());
}
