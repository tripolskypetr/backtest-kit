const apiServices = {
    telegramApiService: Symbol('telegramApiService'),
    quickchartApiService: Symbol('quickchartApiService'),
};

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
    exchangeSchemaService: Symbol('exchangeSchemaService'),
    symbolSchemaService: Symbol('symbolSchemaService'),
    frameSchemaService: Symbol('frameSchemaService'),
    cacheLogicService: Symbol('cacheLogicService'),
}

const providerServices = {
    frontendProviderService: Symbol('frontendProviderService'),
    telegramProviderService: Symbol('telegramProviderService'),
}

const webServices = {
    telegramWebService: Symbol('telegramWebService'),
};

export const TYPES = {
    ...apiServices,
    ...baseServices,
    ...mainServices,
    ...logicServices,
    ...providerServices,
    ...webServices,
}

export default TYPES;
