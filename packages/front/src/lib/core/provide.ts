import ExchangeService from "../services/base/ExchangeService";
import LoggerService from "../services/base/LoggerService";
import NotificationMockService from "../services/mock/NotificationMockService";
import StorageMockService from "../services/mock/StorageMockService";
import ExchangeMockService from "../services/mock/ExchangeMockService";
import LogMockService from "../services/mock/LogMockService";
import NotificationViewService from "../services/view/NotificationViewService";
import StorageViewService from "../services/view/StorageViewService";
import ExchangeViewService from "../services/view/ExchangeViewService";
import LogViewService from "../services/view/LogViewService";
import { provide } from "./di";
import { TYPES } from "./types";
import SymbolConnectionService from "../services/connection/SymbolConnectionService";
import SymbolMetaService from "../services/meta/SymbolMetaService";
import PriceConnectionService from "../services/connection/PriceConnectionService";

{
  provide(TYPES.loggerService, () => new LoggerService());
  provide(TYPES.exchangeService, () => new ExchangeService());
}

{
  provide(TYPES.symbolConnectionService, () => new SymbolConnectionService());
  provide(TYPES.priceConnectionService, () => new PriceConnectionService());
}

{
  provide(TYPES.symbolMetaService, () => new SymbolMetaService());
}

{
  provide(TYPES.notificationMockService, () => new NotificationMockService());
  provide(TYPES.storageMockService, () => new StorageMockService());
  provide(TYPES.exchangeMockService, () => new ExchangeMockService());
  provide(TYPES.logMockService, () => new LogMockService());
}

{
 provide(TYPES.notificationViewService, () => new NotificationViewService());
 provide(TYPES.storageViewService, () => new StorageViewService());
 provide(TYPES.exchangeViewService, () => new ExchangeViewService());
 provide(TYPES.logViewService, () => new LogViewService());
}
