const baseServices = {
    loggerService: Symbol('loggerService'),
};

const contextServices = {
    executionContextService: Symbol('executionContextService'),
    methodContextService: Symbol('methodContextService'),
};

const connectionServices = {
    exchangeConnectionService: Symbol('exchangeConnectionService'),
    strategyConnectionService: Symbol('strategyConnectionService'),
    frameConnectionService: Symbol('frameConnectionService'),
};

const schemaServices = {
    exchangeSchemaService: Symbol('exchangeSchemaService'),
    strategySchemaService: Symbol('strategySchemaService'),
    frameSchemaService: Symbol('frameSchemaService'),
}

const globalServices = {
    exchangeGlobalService: Symbol('exchangeGlobalService'),
    strategyGlobalService: Symbol('strategyGlobalService'),
    frameGlobalService: Symbol('frameGlobalService'),
    liveGlobalService: Symbol('liveGlobalService'),
    backtestGlobalService: Symbol('backtestGlobalService'),
}

const logicPrivateServices = {
    backtestLogicPrivateService: Symbol('backtestLogicPrivateService'),
    liveLogicPrivateService: Symbol('liveLogicPrivateService'),
}

const logicPublicServices = {
    backtestLogicPublicService: Symbol('backtestLogicPublicService'),
    liveLogicPublicService: Symbol('liveLogicPublicService'),
}

const markdownServices = {
    backtestMarkdownService: Symbol('backtestMarkdownService'),
    liveMarkdownService: Symbol('liveMarkdownService'),
}

const validationServices = {
    exchangeValidationService: Symbol('exchangeValidationService'),
    strategyValidationService: Symbol('strategyValidationService'),
    frameValidationService: Symbol('frameValidationService'),
}

export const TYPES = {
    ...baseServices,
    ...contextServices,
    ...connectionServices,
    ...schemaServices,
    ...globalServices,
    ...logicPrivateServices,
    ...logicPublicServices,
    ...markdownServices,
    ...validationServices,
}

export default TYPES;
