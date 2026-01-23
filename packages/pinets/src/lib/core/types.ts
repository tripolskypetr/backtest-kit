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

export const TYPES = {
    ...baseServices,
    ...providerServices,
    ...jobServices,
    ...dataServices,
    ...cacheServices,
}
