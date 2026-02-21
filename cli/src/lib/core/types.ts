const baseServices = {
    loggerService: Symbol('loggerService'),
    resolveService: Symbol('resolveService'),
};

const mainServices = {
    backtestMainService: Symbol('backtestMainService'),
    paperMainService: Symbol('paperMainService'),
    liveMainService: Symbol('liveMainService'),
}

const logicServices = {
    exchangeLogicService: Symbol('exchangeLogicService'),
    frameLogicService: Symbol('frameLogicService'),
}

export const TYPES = {
    ...baseServices,
    ...mainServices,
    ...logicServices,
}

export default TYPES;
