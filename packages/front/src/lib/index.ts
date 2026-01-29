import "./core/provide";

import { init, inject } from "./core/di";
import { TYPES } from "./core/types";
import LoggerService from "./services/base/LoggerService";
import ExchangeService from "./services/base/ExchangeService";
import NotificationMockService from "./services/mock/NotificationMockService";
import StorageMockService from "./services/mock/StorageMockService";
import ExchangeMockService from "./services/mock/ExchangeMockService";
import NotificationViewService from "./services/view/NotificationViewService";
import StorageViewService from "./services/view/StorageViewService";
import ExchangeViewService from "./services/view/ExchangeViewService";
import SymbolConnectionService from "./services/connection/SymbolConnectionService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
  exchangeService: inject<ExchangeService>(TYPES.exchangeService),
};

const connectionServices = {
  symbolConnectionService: inject<SymbolConnectionService>(TYPES.symbolConnectionService),
}

const mockServices = {
  notificationMockService: inject<NotificationMockService>(TYPES.notificationMockService),
  storageMockService: inject<StorageMockService>(TYPES.storageMockService),
  exchangeMockService: inject<ExchangeMockService>(TYPES.exchangeMockService),
};

const viewServices = {
  notificationViewService: inject<NotificationViewService>(TYPES.notificationViewService),
  storageViewService: inject<StorageViewService>(TYPES.storageViewService),
  exchangeViewService: inject<ExchangeViewService>(TYPES.exchangeViewService),
};

const ioc = {
  ...baseServices,
  ...connectionServices,
  ...mockServices,
  ...viewServices,
};

init();

export { ioc };

export default ioc;
