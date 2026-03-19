const baseServices = {
    loggerService: Symbol("loggerService"),
    exchangeService: Symbol('exchangeService'),
};

const connectionServices = {
    symbolConnectionService: Symbol("symbolConnectionService"),
    priceConnectionService: Symbol("priceConnectionService"),
}

const metaServices = {
    symbolMetaService: Symbol("symbolMetaService"),
    backtestMetaService: Symbol("backtestMetaService"),
    liveMetaService: Symbol("liveMetaService"),
}

const mockServices = {
    notificationMockService: Symbol("notificationMockService"),
    storageMockService: Symbol("storageMockService"),
    exchangeMockService: Symbol("exchangeMockService"),
    logMockService: Symbol("logMockService"),
    statusMockService: Symbol("statusMockService"),
    markdownMockService: Symbol("markdownMockService"),
    explorerMockService: Symbol("explorerMockService"),
    signalMockService: Symbol("signalMockService"),
    heatMockService: Symbol("heatMockService"),
}

const viewServices = {
    notificationViewService: Symbol("notificationViewService"),
    storageViewService: Symbol("storageViewService"),
    exchangeViewService: Symbol("exchangeViewService"),
    logViewService: Symbol("logViewService"),
    statusViewService: Symbol("statusViewService"),
    markdownViewService: Symbol("markdownViewService"),
    explorerViewService: Symbol("explorerViewService"),
    signalViewService: Symbol("signalViewService"),
    heatViewService: Symbol("heatViewService"),
}

export const TYPES = {
    ...baseServices,
    ...connectionServices,
    ...metaServices,
    ...mockServices,
    ...viewServices,
}
