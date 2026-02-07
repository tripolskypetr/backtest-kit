const baseServices = {
    loggerService: Symbol("loggerService"),
}

const contextServices = {
    exchangeContextService: Symbol("exchangeContextService"),
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

const markdownServices = {
    pineMarkdownService: Symbol("pineMarkdownService"),
}

export const TYPES = {
    ...baseServices,
    ...contextServices,
    ...providerServices,
    ...jobServices,
    ...dataServices,
    ...cacheServices,
    ...connectionServices,
    ...markdownServices,
}
