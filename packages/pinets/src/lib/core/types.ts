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

export const TYPES = {
    ...baseServices,
    ...providerServices,
    ...jobServices,
}
