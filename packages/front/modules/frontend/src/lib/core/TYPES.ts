const baseServices = {
  alertService: Symbol("alertService"),
  errorService: Symbol("errorService"),
  layoutService: Symbol("layoutService"),
  loggerService: Symbol("loggerService"),
  routerService: Symbol("routerService"),
};

const mockServices = {
  exchangeMockService: Symbol("exchangeMockService"),
  notificationMockService: Symbol("notificationMockService"),
  storageMockService: Symbol("storageMockService"),
};

const viewServices = {
  exchangeViewService: Symbol("exchangeViewService"),
  notificationViewService: Symbol("notificationViewService"),
  storageViewService: Symbol("storageViewService"),
};

export const TYPES = {
  ...baseServices,
  ...mockServices,
  ...viewServices,
};

export default TYPES;
