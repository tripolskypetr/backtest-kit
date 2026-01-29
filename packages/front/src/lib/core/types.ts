const baseServices = {
    loggerService: Symbol("loggerService"),
    exchangeService: Symbol('exchangeService'),
};

const connectionServices = {
    symbolConnectionService: Symbol("symbolConnectionService"),
}

const mockServices = {
    notificationMockService: Symbol("notificationMockService"),
    storageMockService: Symbol("storageMockService"),
    exchangeMockService: Symbol("exchangeMockService"),
}

const viewServices = {
    notificationViewService: Symbol("notificationViewService"),
    storageViewService: Symbol("storageViewService"),
    exchangeViewService: Symbol("exchangeViewService"),
}

export const TYPES = {
    ...baseServices,
    ...connectionServices,
    ...mockServices,
    ...viewServices,
}
