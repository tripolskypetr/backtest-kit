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
  backtestGlobalService: Symbol("backtestGlobalService"),
  liveGlobalService: Symbol("liveGlobalService"),
}

const helperServices = {
  explorerHelperService: Symbol("explorerHelperService"),
  markdownHelperService: Symbol("markdownHelperService"),
}

const mockServices = {
  exchangeMockService: Symbol("exchangeMockService"),
  notificationMockService: Symbol("notificationMockService"),
  storageMockService: Symbol("storageMockService"),
  logMockService: Symbol("logMockService"),
  statusMockService: Symbol("statusMockService"),
  markdownMockService: Symbol("markdownMockService"),
  explorerMockService: Symbol("explorerMockService"),
  signalMockService: Symbol("signalMockService"),
  heatMockService: Symbol("heatMockService"),
};

const viewServices = {
  exchangeViewService: Symbol("exchangeViewService"),
  notificationViewService: Symbol("notificationViewService"),
  storageViewService: Symbol("storageViewService"),
  logViewService: Symbol("logViewService"),
  statusViewService: Symbol("statusViewService"),
  markdownViewService: Symbol("markdownViewService"),
  explorerViewService: Symbol("explorerViewService"),
  signalViewService: Symbol("signalViewService"),
  heatViewService: Symbol("heatViewService"),
};

export const TYPES = {
  ...baseServices,
  ...globalServices,
  ...helperServices,
  ...mockServices,
  ...viewServices,
};

export default TYPES;
