const baseServices = {
    errorService: Symbol('errorService'),
    loggerService: Symbol('loggerService'),
    resolveService: Symbol('resolveService'),
};

const mainServices = {
    backtestMainService: Symbol('backtestMainService'),
    paperMainService: Symbol('paperMainService'),
    liveMainService: Symbol('liveMainService'),
}

const logicServices = {
    exchangeLogicService: Symbol('exchangeLogicService'),
    symbolLogicService: Symbol('symbolLogicService'),
    frameLogicService: Symbol('frameLogicService'),
}

const providerServices = {
    frontendProviderService: Symbol('frontendProviderService'),
    telegramProviderService: Symbol('telegramProviderService'),
}

export const TYPES = {
    ...baseServices,
    ...mainServices,
    ...logicServices,
    ...providerServices,
}

export default TYPES;
