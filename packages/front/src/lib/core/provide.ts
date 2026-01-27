import LoggerService from "../services/base/LoggerService";
import NotificationMockService from "../services/mock/NotificationMockService";
import StorageMockService from "../services/mock/StorageMockService";
import NotificationViewService from "../services/view/NotificationViewService";
import StorageViewService from "../services/view/StorageViewService";
import { provide } from "./di";
import { TYPES } from "./types";

{
  provide(TYPES.loggerService, () => new LoggerService());
}

{
  provide(TYPES.notificationMockService, () => new NotificationMockService());
  provide(TYPES.storageMockService, () => new StorageMockService());
}

{
 provide(TYPES.notificationViewService, () => new NotificationViewService());
 provide(TYPES.storageViewService, () => new StorageViewService());
}
