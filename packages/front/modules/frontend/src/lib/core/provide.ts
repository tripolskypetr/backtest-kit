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

import ExchangeViewService from "../services/view/ExchangeViewService";
import NotificationViewService from "../services/view/NotificationViewService";
import StorageViewService from "../services/view/StorageViewService";

{
    provide(TYPES.errorService, () => new ErrorService());
    provide(TYPES.alertService, () => new AlertService());
    provide(TYPES.layoutService, () => new LayoutService());
    provide(TYPES.loggerService, () => new LoggerService());
    provide(TYPES.routerService, () => new RouterService());

    provide(TYPES.exchangeMockService, () => new ExchangeMockService());
    provide(TYPES.notificationMockService, () => new NotificationMockService());
    provide(TYPES.storageMockService, () => new StorageMockService());

    provide(TYPES.exchangeViewService, () => new ExchangeViewService());
    provide(TYPES.notificationViewService, () => new NotificationViewService());
    provide(TYPES.storageViewService, () => new StorageViewService());
}
