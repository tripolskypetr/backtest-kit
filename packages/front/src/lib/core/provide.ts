import ExchangeService from "../services/base/ExchangeService";
import LoggerService from "../services/base/LoggerService";
import NotificationMockService from "../services/mock/NotificationMockService";
import StorageMockService from "../services/mock/StorageMockService";
import ExchangeMockService from "../services/mock/ExchangeMockService";
import NotificationViewService from "../services/view/NotificationViewService";
import StorageViewService from "../services/view/StorageViewService";
import ExchangeViewService from "../services/view/ExchangeViewService";
import { provide } from "./di";
import { TYPES } from "./types";
import SymbolConnectionService from "../services/connection/SymbolConnectionService";

{
  provide(TYPES.loggerService, () => new LoggerService());
  provide(TYPES.exchangeService, () => new ExchangeService());
}

{
  provide(TYPES.symbolConnectionService, () => new SymbolConnectionService());
}

{
  provide(TYPES.notificationMockService, () => new NotificationMockService());
  provide(TYPES.storageMockService, () => new StorageMockService());
  provide(TYPES.exchangeMockService, () => new ExchangeMockService());
}

{
 provide(TYPES.notificationViewService, () => new NotificationViewService());
 provide(TYPES.storageViewService, () => new StorageViewService());
 provide(TYPES.exchangeViewService, () => new ExchangeViewService());
}
