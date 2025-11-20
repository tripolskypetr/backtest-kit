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
}

const logicPrivateServices = {
    backtestLogicPrivateService: Symbol('backtestLogicPrivateService'),
    liveLogicPrivateService: Symbol('liveLogicPrivateService'),
}

const logicPublicServices = {

}

export const TYPES = {
    ...baseServices,
    ...contextServices,
    ...connectionServices,
    ...schemaServices,
    ...globalServices,
    ...logicPrivateServices,
    ...logicPublicServices,
}

export default TYPES;
