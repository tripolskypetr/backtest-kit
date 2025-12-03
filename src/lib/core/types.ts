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
    sizingConnectionService: Symbol('sizingConnectionService'),
    riskConnectionService: Symbol('riskConnectionService'),
    optimizerConnectionService: Symbol('optimizerConnectionService'),
    partialConnectionService: Symbol('partialConnectionService'),
};

const schemaServices = {
    exchangeSchemaService: Symbol('exchangeSchemaService'),
    strategySchemaService: Symbol('strategySchemaService'),
    frameSchemaService: Symbol('frameSchemaService'),
    walkerSchemaService: Symbol('walkerSchemaService'),
    sizingSchemaService: Symbol('sizingSchemaService'),
    riskSchemaService: Symbol('riskSchemaService'),
    optimizerSchemaService: Symbol('optimizerSchemaService'),
}

const globalServices = {
    exchangeGlobalService: Symbol('exchangeGlobalService'),
    strategyGlobalService: Symbol('strategyGlobalService'),
    frameGlobalService: Symbol('frameGlobalService'),
    sizingGlobalService: Symbol('sizingGlobalService'),
    riskGlobalService: Symbol('riskGlobalService'),
    optimizerGlobalService: Symbol('optimizerGlobalService'),
}

const commandServices = {
 liveCommandService: Symbol('liveCommandService'),
    backtestCommandService: Symbol('backtestCommandService'),
    walkerCommandService: Symbol('walkerCommandService'),
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
    scheduleMarkdownService: Symbol('scheduleMarkdownService'),
    performanceMarkdownService: Symbol('performanceMarkdownService'),
    walkerMarkdownService: Symbol('walkerMarkdownService'),
    heatMarkdownService: Symbol('heatMarkdownService'),
    partialMarkdownService: Symbol('partialMarkdownService'),
}

const validationServices = {
    exchangeValidationService: Symbol('exchangeValidationService'),
    strategyValidationService: Symbol('strategyValidationService'),
    frameValidationService: Symbol('frameValidationService'),
    walkerValidationService: Symbol('walkerValidationService'),
    sizingValidationService: Symbol('sizingValidationService'),
    riskValidationService: Symbol('riskValidationService'),
    optimizerValidationService: Symbol('optimizerValidationService'),
}

const templateServices = {
    optimizerTemplateService: Symbol('optimizerTemplateService'),
}

export const TYPES = {
    ...baseServices,
    ...contextServices,
    ...connectionServices,
    ...schemaServices,
    ...globalServices,
    ...commandServices,
    ...logicPrivateServices,
    ...logicPublicServices,
    ...markdownServices,
    ...validationServices,
    ...templateServices,
}

export default TYPES;
