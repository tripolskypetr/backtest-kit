const baseServices = {
    loggerService: Symbol("loggerService"),
};

const mockServices = {
    notificationMockService: Symbol("notificationMockService"),
    storageMockService: Symbol("storageMockService"),
}

const viewServices = {
    notificationViewService: Symbol("notificationViewService"),
    storageViewService: Symbol("storageViewService"),
}

export const TYPES = {
    ...baseServices,
    ...mockServices,
    ...viewServices,
}
