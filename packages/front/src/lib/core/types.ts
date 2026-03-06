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
}

const mockServices = {
    notificationMockService: Symbol("notificationMockService"),
    storageMockService: Symbol("storageMockService"),
    exchangeMockService: Symbol("exchangeMockService"),
    logMockService: Symbol("logMockService"),
    statusMockService: Symbol("statusMockService"),
}

const viewServices = {
    notificationViewService: Symbol("notificationViewService"),
    storageViewService: Symbol("storageViewService"),
    exchangeViewService: Symbol("exchangeViewService"),
    logViewService: Symbol("logViewService"),
    statusViewService: Symbol("statusViewService"),
}

export const TYPES = {
    ...baseServices,
    ...connectionServices,
    ...metaServices,
    ...mockServices,
    ...viewServices,
}
