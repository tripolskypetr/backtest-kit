const baseServices = {
  alertService: Symbol("alertService"),
  errorService: Symbol("errorService"),
  layoutService: Symbol("layoutService"),
  loggerService: Symbol("loggerService"),
  routerService: Symbol("routerService"),
};

const globalServices = {
  symbolGlobalService: Symbol("symbolGlobalService"),
  priceGlobalService: Symbol("priceGlobalService"),
}

const mockServices = {
  exchangeMockService: Symbol("exchangeMockService"),
  notificationMockService: Symbol("notificationMockService"),
  storageMockService: Symbol("storageMockService"),
  logMockService: Symbol("logMockService"),
  statusMockService: Symbol("statusMockService"),
  markdownMockService: Symbol("markdownMockService"),
};

const viewServices = {
  exchangeViewService: Symbol("exchangeViewService"),
  notificationViewService: Symbol("notificationViewService"),
  storageViewService: Symbol("storageViewService"),
  logViewService: Symbol("logViewService"),
  statusViewService: Symbol("statusViewService"),
  markdownViewService: Symbol("markdownViewService"),
};

export const TYPES = {
  ...baseServices,
  ...globalServices,
  ...mockServices,
  ...viewServices,
};

export default TYPES;
