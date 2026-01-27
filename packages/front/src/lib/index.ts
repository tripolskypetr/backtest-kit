import "./core/provide";

import { init, inject } from "./core/di";
import { TYPES } from "./core/types";
import LoggerService from "./services/base/LoggerService";
import NotificationMockService from "./services/mock/NotificationMockService";
import StorageMockService from "./services/mock/StorageMockService";
import NotificationViewService from "./services/view/NotificationViewService";
import StorageViewService from "./services/view/StorageViewService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};

const mockServices = {
  notificationMockService: inject<NotificationMockService>(TYPES.notificationMockService),
  storageMockService: inject<StorageMockService>(TYPES.storageMockService),
};

const viewServices = {
  notificationViewService: inject<NotificationViewService>(TYPES.notificationViewService),
  storageViewService: inject<StorageViewService>(TYPES.storageViewService),
};

const signal = {
  ...baseServices,
  ...mockServices,
  ...viewServices,
};

init();

export { signal };

export default signal;
