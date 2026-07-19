import { provide } from "react-declarative";
import TYPES from "./TYPES";

import ErrorService from "../services/base/ErrorService";
import LayoutService from "../services/base/LayoutService";
import LoggerService from "../services/base/LoggerService";
import RouterService from "../services/base/RouterService";
import AlertService from "../services/base/AlertService";
import LinkService from "../services/base/LinkService";

import ExchangeMockService from "../services/mock/ExchangeMockService";
import NotificationMockService from "../services/mock/NotificationMockService";
import StorageMockService from "../services/mock/StorageMockService";
import LogMockService from "../services/mock/LogMockService";
import StatusMockService from "../services/mock/StatusMockService";
import MarkdownMockService from "../services/mock/MarkdownMockService";
import ExplorerMockService from "../services/mock/ExplorerMockService";
import SignalMockService from "../services/mock/SignalMockService";
import HeatMockService from "../services/mock/HeatMockService";
import PerformanceMockService from "../services/mock/PerformanceMockService";
import EnvironmentMockService from "../services/mock/EnvironmentMockService";
import SetupMockService from "../services/mock/SetupMockService";
import RuntimeMockService from "../services/mock/RuntimeMockService";
import ControlMockService from "../services/mock/ControlMockService";
import PauseMockService from "../services/mock/PauseMockService";

import ExchangeViewService from "../services/view/ExchangeViewService";
import NotificationViewService from "../services/view/NotificationViewService";
import StorageViewService from "../services/view/StorageViewService";
import LogViewService from "../services/view/LogViewService";
import StatusViewService from "../services/view/StatusViewService";
import MarkdownViewService from "../services/view/MarkdownViewService";
import ExplorerViewService from "../services/view/ExplorerViewService";
import SignalViewService from "../services/view/SignalViewService";
import HeatViewService from "../services/view/HeatViewService";
import PerformanceViewService from "../services/view/PerformanceViewService";
import EnvironmentViewService from "../services/view/EnvironmentViewService";
import SetupViewService from "../services/view/SetupViewService";
import RuntimeViewService from "../services/view/RuntimeViewService";
import ControlViewService from "../services/view/ControlViewService";
import PauseViewService from "../services/view/PauseViewService";
import SymbolGlobalService from "../services/global/SymbolGlobalService";
import PriceGlobalService from "../services/global/PriceGlobalService";
import BacktestGlobalService from "../services/global/BacktestGlobalService";
import LiveGlobalService from "../services/global/LiveGlobalService";
import ReplGlobalService from "../services/global/ReplGlobalService";
import MarkdownHelperService from "../services/helpers/MarkdownHelperService";
import ExplorerHelperService from "../services/helpers/ExplorerHelperService";

{
    provide(TYPES.errorService, () => new ErrorService());
    provide(TYPES.alertService, () => new AlertService());
    provide(TYPES.layoutService, () => new LayoutService());
    provide(TYPES.loggerService, () => new LoggerService());
    provide(TYPES.routerService, () => new RouterService());
    provide(TYPES.linkService, () => new LinkService());
}

{
    provide(TYPES.symbolGlobalService, () => new SymbolGlobalService());
    provide(TYPES.priceGlobalService, () => new PriceGlobalService());
    provide(TYPES.backtestGlobalService, () => new BacktestGlobalService());
    provide(TYPES.liveGlobalService, () => new LiveGlobalService());
    provide(TYPES.replGlobalService, () => new ReplGlobalService());
}

{
    provide(TYPES.explorerHelperService, () => new ExplorerHelperService());
    provide(TYPES.markdownHelperService, () => new MarkdownHelperService());
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
    provide(TYPES.heatMockService, () => new HeatMockService());
    provide(TYPES.performanceMockService, () => new PerformanceMockService());
    provide(TYPES.environmentMockService, () => new EnvironmentMockService());
    provide(TYPES.setupMockService, () => new SetupMockService());
    provide(TYPES.runtimeMockService, () => new RuntimeMockService());
    provide(TYPES.controlMockService, () => new ControlMockService());
    provide(TYPES.pauseMockService, () => new PauseMockService());
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
    provide(TYPES.heatViewService, () => new HeatViewService());
    provide(TYPES.performanceViewService, () => new PerformanceViewService());
    provide(TYPES.environmentViewService, () => new EnvironmentViewService());
    provide(TYPES.setupViewService, () => new SetupViewService());
    provide(TYPES.runtimeViewService, () => new RuntimeViewService());
    provide(TYPES.controlViewService, () => new ControlViewService());
    provide(TYPES.pauseViewService, () => new PauseViewService());
}
