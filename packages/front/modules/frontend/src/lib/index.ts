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

import ExchangeViewService from "./services/view/ExchangeViewService";
import NotificationViewService from "./services/view/NotificationViewService";
import StorageViewService from "./services/view/StorageViewService";

import TYPES from "./core/TYPES";

const baseServices = {
  errorService: inject<ErrorService>(TYPES.errorService),
  layoutService: inject<LayoutService>(TYPES.layoutService),
  loggerService: inject<LoggerService>(TYPES.loggerService),
  routerService: inject<RouterService>(TYPES.routerService),
  alertService: inject<AlertService>(TYPES.alertService),
};

const mockServices = {
  exchangeMockService: inject<ExchangeMockService>(TYPES.exchangeMockService),
  notificationMockService: inject<NotificationMockService>(TYPES.notificationMockService),
  storageMockService: inject<StorageMockService>(TYPES.storageMockService),
};

const viewServices = {
  exchangeViewService: inject<ExchangeViewService>(TYPES.exchangeViewService),
  notificationViewService: inject<NotificationViewService>(TYPES.notificationViewService),
  storageViewService: inject<StorageViewService>(TYPES.storageViewService),
};

export const ioc = {
  ...baseServices,
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
