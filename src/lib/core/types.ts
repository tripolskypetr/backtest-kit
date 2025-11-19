const baseServices = {
    loggerService: Symbol('loggerService'),
};

const contextServices = {
    executionContextService: Symbol('executionContextService'),
};

const connectionServices = {
    candleConnectionService: Symbol('candleConnectionService'),
    strategyConnectionService: Symbol('strategyConnectionService'),
};

const schemaServices = {
    candleSchemaService: Symbol('candleSchemaService'),
    strategySchemaService: Symbol('strategySchemaService'),
}

export const TYPES = {
    ...baseServices,
    ...contextServices,
    ...connectionServices,
    ...schemaServices,
}

export default TYPES;
