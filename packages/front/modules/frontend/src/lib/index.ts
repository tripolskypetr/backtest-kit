import "./core/provide";

import { getErrorMessage, inject } from "react-declarative";

import ErrorService from "./services/base/ErrorService";
import LayoutService from "./services/base/LayoutService";
import LoggerService from "./services/base/LoggerService";
import RouterService from "./services/base/RouterService";
import AlertService from "./services/base/AlertService";

import ExchangeMockService from "./services/mock/ExchangeMockService";
import NotificationMockService from "./services/mock/NotificationMockService";
import StorageMockService from "./services/mock/StorageMockService";
import LogMockService from "./services/mock/LogMockService";
import StatusMockService from "./services/mock/StatusMockService";
import MarkdownMockService from "./services/mock/MarkdownMockService";
import ExplorerMockService from "./services/mock/ExplorerMockService";

import ExchangeViewService from "./services/view/ExchangeViewService";
import NotificationViewService from "./services/view/NotificationViewService";
import StorageViewService from "./services/view/StorageViewService";
import LogViewService from "./services/view/LogViewService";
import StatusViewService from "./services/view/StatusViewService";
import MarkdownViewService from "./services/view/MarkdownViewService";
import ExplorerViewService from "./services/view/ExplorerViewService";

import SymbolGlobalService from "./services/global/SymbolGlobalService";
import PriceGlobalService from "./services/global/PriceGlobalService";
import BacktestGlobalService from "./services/global/BacktestGlobalService";
import LiveGlobalService from "./services/global/LiveGlobalService";

import TYPES from "./core/TYPES";
import ExplorerHelperService from "./services/helpers/ExplorerHelperService";
import MarkdownHelperService from "./services/helpers/MarkdownHelperService";
import SignalViewService from "./services/view/SignalViewService";
import HeatViewService from "./services/view/HeatViewService";
import SignalMockService from "./services/mock/SignalMockService";
import HeatMockService from "./services/mock/HeatMockService";

const baseServices = {
  errorService: inject<ErrorService>(TYPES.errorService),
  layoutService: inject<LayoutService>(TYPES.layoutService),
  loggerService: inject<LoggerService>(TYPES.loggerService),
  routerService: inject<RouterService>(TYPES.routerService),
  alertService: inject<AlertService>(TYPES.alertService),
};

const globalServices = {
  symbolGlobalService: inject<SymbolGlobalService>(TYPES.symbolGlobalService),
  priceGlobalService: inject<PriceGlobalService>(TYPES.priceGlobalService),
  backtestGlobalService: inject<BacktestGlobalService>(TYPES.backtestGlobalService),
  liveGlobalService: inject<LiveGlobalService>(TYPES.liveGlobalService),
}

const helperServices = {
  explorerHelperService: inject<ExplorerHelperService>(TYPES.explorerHelperService),
  markdownHelperService: inject<MarkdownHelperService>(TYPES.markdownHelperService),
}

const mockServices = {
  exchangeMockService: inject<ExchangeMockService>(TYPES.exchangeMockService),
  notificationMockService: inject<NotificationMockService>(TYPES.notificationMockService),
  storageMockService: inject<StorageMockService>(TYPES.storageMockService),
  logMockService: inject<LogMockService>(TYPES.logMockService),
  statusMockService: inject<StatusMockService>(TYPES.statusMockService),
  markdownMockService: inject<MarkdownMockService>(TYPES.markdownMockService),
  explorerMockService: inject<ExplorerMockService>(TYPES.explorerMockService),
  signalMockService: inject<SignalMockService>(TYPES.signalMockService),
  heatMockService: inject<HeatMockService>(TYPES.heatMockService),
};

const viewServices = {
  exchangeViewService: inject<ExchangeViewService>(TYPES.exchangeViewService),
  notificationViewService: inject<NotificationViewService>(TYPES.notificationViewService),
  storageViewService: inject<StorageViewService>(TYPES.storageViewService),
  logViewService: inject<LogViewService>(TYPES.logViewService),
  statusViewService: inject<StatusViewService>(TYPES.statusViewService),
  markdownViewService: inject<MarkdownViewService>(TYPES.markdownViewService),
  explorerViewService: inject<ExplorerViewService>(TYPES.explorerViewService),
  signalViewService: inject<SignalViewService>(TYPES.signalViewService),
  heatViewService: inject<HeatViewService>(TYPES.heatViewService),
};

export const ioc = {
  ...baseServices,
  ...globalServices,
  ...helperServices,
  ...mockServices,
  ...viewServices,
};

ioc.routerService.listen(({ action, location }) => {
  if (location.pathname === "/error_page") {
    return;
  }
  if (location.pathname === "/offline_page") {
    return;
  }
  if (action === "PUSH") {
    console.clear();
  }
});

window.addEventListener("unhandledrejection", (error) => {
  ioc.errorService.handleGlobalError(new Error(error.reason));
});

window.addEventListener("error", (error) => {
    ioc.errorService.handleGlobalError(new Error(getErrorMessage(error)));
});

Object.assign(window, { ioc });

export default ioc;
