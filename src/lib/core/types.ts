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
    actionConnectionService: Symbol('actionConnectionService'),
    optimizerConnectionService: Symbol('optimizerConnectionService'),
    partialConnectionService: Symbol('partialConnectionService'),
    breakevenConnectionService: Symbol('breakevenConnectionService'),
};

const schemaServices = {
    exchangeSchemaService: Symbol('exchangeSchemaService'),
    strategySchemaService: Symbol('strategySchemaService'),
    frameSchemaService: Symbol('frameSchemaService'),
    walkerSchemaService: Symbol('walkerSchemaService'),
    sizingSchemaService: Symbol('sizingSchemaService'),
    riskSchemaService: Symbol('riskSchemaService'),
    actionSchemaService: Symbol('actionSchemaService'),
    optimizerSchemaService: Symbol('optimizerSchemaService'),
}

const coreServices = {
    exchangeCoreService: Symbol('exchangeCoreService'),
    strategyCoreService: Symbol('strategyCoreService'),
    actionCoreService: Symbol('actionCoreService'),
    frameCoreService: Symbol('frameCoreService'),
}

const globalServices = {
    sizingGlobalService: Symbol('sizingGlobalService'),
    riskGlobalService: Symbol('riskGlobalService'),
    optimizerGlobalService: Symbol('optimizerGlobalService'),
    partialGlobalService: Symbol('partialGlobalService'),
    breakevenGlobalService: Symbol('breakevenGlobalService'),
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
    breakevenMarkdownService: Symbol('breakevenMarkdownService'),
    outlineMarkdownService: Symbol('outlineMarkdownService'),
    riskMarkdownService: Symbol('riskMarkdownService'),
}

const reportServices = {
    backtestReportService: Symbol('backtestReportService'),
    liveReportService: Symbol('liveReportService'),
    scheduleReportService: Symbol('scheduleReportService'),
    performanceReportService: Symbol('performanceReportService'),
    walkerReportService: Symbol('walkerReportService'),
    heatReportService: Symbol('heatReportService'),
    partialReportService: Symbol('partialReportService'),
    breakevenReportService: Symbol('breakevenReportService'),
    riskReportService: Symbol('riskReportService'),
}

const validationServices = {
    exchangeValidationService: Symbol('exchangeValidationService'),
    strategyValidationService: Symbol('strategyValidationService'),
    frameValidationService: Symbol('frameValidationService'),
    walkerValidationService: Symbol('walkerValidationService'),
    sizingValidationService: Symbol('sizingValidationService'),
    riskValidationService: Symbol('riskValidationService'),
    actionValidationService: Symbol('actionValidationService'),
    optimizerValidationService: Symbol('optimizerValidationService'),
    configValidationService: Symbol('configValidationService'),
    columnValidationService: Symbol('columnValidationService'),
}

const templateServices = {
    optimizerTemplateService: Symbol('optimizerTemplateService'),
}

const promptServices = {
    signalPromptService: Symbol('signalPromptService'),
}

export const TYPES = {
    ...baseServices,
    ...contextServices,
    ...connectionServices,
    ...schemaServices,
    ...coreServices,
    ...globalServices,
    ...commandServices,
    ...logicPrivateServices,
    ...logicPublicServices,
    ...markdownServices,
    ...reportServices,
    ...validationServices,
    ...templateServices,
    ...promptServices,
}

export default TYPES;
