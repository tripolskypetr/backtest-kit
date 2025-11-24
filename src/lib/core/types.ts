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
    walkerSchemaService: Symbol('walkerSchemaService'),
}

const globalServices = {
    exchangeGlobalService: Symbol('exchangeGlobalService'),
    strategyGlobalService: Symbol('strategyGlobalService'),
    frameGlobalService: Symbol('frameGlobalService'),
    liveGlobalService: Symbol('liveGlobalService'),
    backtestGlobalService: Symbol('backtestGlobalService'),
    walkerGlobalService: Symbol('walkerGlobalService'),
}

const logicPrivateServices = {
    backtestLogicPrivateService: Symbol('backtestLogicPrivateService'),
    liveLogicPrivateService: Symbol('liveLogicPrivateService'),
    walkerLogicPrivateService: Symbol('walkerLogicPrivateService'),
}

const logicPublicServices = {
    backtestLogicPublicService: Symbol('backtestLogicPublicService'),
    liveLogicPublicService: Symbol('liveLogicPublicService'),
    walkerLogicPublicService: Symbol('walkerLogicPublicService'),
}

const markdownServices = {
    backtestMarkdownService: Symbol('backtestMarkdownService'),
    liveMarkdownService: Symbol('liveMarkdownService'),
    performanceMarkdownService: Symbol('performanceMarkdownService'),
    walkerMarkdownService: Symbol('walkerMarkdownService'),
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
