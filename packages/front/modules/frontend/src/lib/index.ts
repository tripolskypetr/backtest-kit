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

import ExchangeViewService from "./services/view/ExchangeViewService";
import NotificationViewService from "./services/view/NotificationViewService";
import StorageViewService from "./services/view/StorageViewService";
import LogViewService from "./services/view/LogViewService";

import SymbolGlobalService from "./services/global/SymbolGlobalService";
import PriceGlobalService from "./services/global/PriceGlobalService";

import TYPES from "./core/TYPES";

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
}

const mockServices = {
  exchangeMockService: inject<ExchangeMockService>(TYPES.exchangeMockService),
  notificationMockService: inject<NotificationMockService>(TYPES.notificationMockService),
  storageMockService: inject<StorageMockService>(TYPES.storageMockService),
  logMockService: inject<LogMockService>(TYPES.logMockService),
};

const viewServices = {
  exchangeViewService: inject<ExchangeViewService>(TYPES.exchangeViewService),
  notificationViewService: inject<NotificationViewService>(TYPES.notificationViewService),
  storageViewService: inject<StorageViewService>(TYPES.storageViewService),
  logViewService: inject<LogViewService>(TYPES.logViewService),
};

export const ioc = {
  ...baseServices,
  ...globalServices,
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
