const apiServices = {
    telegramApiService: Symbol('telegramApiService'),
    quickchartApiService: Symbol('quickchartApiService'),
};

const baseServices = {
    errorService: Symbol('errorService'),
    loggerService: Symbol('loggerService'),
    resolveService: Symbol('resolveService'),
};

const connectionServices = {
    moduleConnectionService: Symbol('moduleConnectionService'),
}

const mainServices = {
    backtestMainService: Symbol('backtestMainService'),
    paperMainService: Symbol('paperMainService'),
    liveMainService: Symbol('liveMainService'),
}

const logicServices = {
    cacheLogicService: Symbol('cacheLogicService'),
    telegramLogicService: Symbol('telegramLogicService'),
}

const schemaServices = {
    exchangeSchemaService: Symbol('exchangeSchemaService'),
    symbolSchemaService: Symbol('symbolSchemaService'),
    frameSchemaService: Symbol('frameSchemaService'),
}

const providerServices = {
    frontendProviderService: Symbol('frontendProviderService'),
    telegramProviderService: Symbol('telegramProviderService'),
    liveProviderService: Symbol('liveProviderService'),
}

const webServices = {
    telegramWebService: Symbol('telegramWebService'),
};

const templateServices = {
    telegramTemplateService: Symbol('telegramTemplateService'),
};

export const TYPES = {
    ...apiServices,
    ...baseServices,
    ...connectionServices,
    ...mainServices,
    ...logicServices,
    ...schemaServices,
    ...providerServices,
    ...webServices,
    ...templateServices,
}

export default TYPES;
