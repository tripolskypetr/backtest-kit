const apiServices = {
    telegramApiService: Symbol('telegramApiService'),
    quickchartApiService: Symbol('quickchartApiService'),
};

const baseServices = {
    errorService: Symbol('errorService'),
    loggerService: Symbol('loggerService'),
};

const coreServices = {
    resolveService: Symbol('resolveService'),
    loaderService: Symbol('loaderService'),
    configService: Symbol('configService'),
    babelService: Symbol('babelService'),
}

const connectionServices = {
    moduleConnectionService: Symbol('moduleConnectionService'),
    configConnectionService: Symbol('configConnectionService'),
}

const mainServices = {
    backtestMainService: Symbol('backtestMainService'),
    walkerMainService: Symbol('walkerMainService'),
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
    ...coreServices,
    ...connectionServices,
    ...mainServices,
    ...logicServices,
    ...schemaServices,
    ...providerServices,
    ...webServices,
    ...templateServices,
}

export default TYPES;
