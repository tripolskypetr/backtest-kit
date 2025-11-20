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
};

const schemaServices = {
    exchangeSchemaService: Symbol('exchangeSchemaService'),
    strategySchemaService: Symbol('strategySchemaService'),
}

const publicServices = {
    exchangePublicService: Symbol('exchangePublicService'),
    strategyPublicService: Symbol('strategyPublicService'),
}

export const TYPES = {
    ...baseServices,
    ...contextServices,
    ...connectionServices,
    ...schemaServices,
    ...publicServices,
}

export default TYPES;
