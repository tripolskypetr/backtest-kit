const baseServices = {
    loggerService: Symbol("loggerService"),
}

const providerServices = {
    axisProviderService: Symbol("axisProviderService"),
    candleProviderService: Symbol("candleProviderService"),
}

const jobServices = {
    pineJobService: Symbol("pineJobService"),
}

const dataServices = {
    pineDataService: Symbol("pineDataService"),
}

const cacheServices = {
    pineCacheService: Symbol("pineCacheService"),
}

const connectionServices = {
    pineConnectionService: Symbol("pineConnectionService"),
}

export const TYPES = {
    ...baseServices,
    ...providerServices,
    ...jobServices,
    ...dataServices,
    ...cacheServices,
    ...connectionServices,
}
