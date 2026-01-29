import "./core/provide";

import { getErrorMessage, inject } from "react-declarative";

import ErrorService from "./services/base/ErrorService";
import LayoutService from "./services/base/LayoutService";
import LoggerService from "./services/base/LoggerService";
import RouterService from "./services/base/RouterService";
import AlertService from "./services/base/AlertService";

import TYPES from "./core/TYPES";

const baseServices = {
  errorService: inject<ErrorService>(TYPES.errorService),
  layoutService: inject<LayoutService>(TYPES.layoutService),
  loggerService: inject<LoggerService>(TYPES.loggerService),
  routerService: inject<RouterService>(TYPES.routerService),
  alertService: inject<AlertService>(TYPES.alertService),
};


export const ioc = {
  ...baseServices,
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
