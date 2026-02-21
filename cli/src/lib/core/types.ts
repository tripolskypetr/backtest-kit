const baseServices = {
    loggerService: Symbol('loggerService'),
};

const mainServices = {
    backtestMainService: Symbol('backtestMainService'),
    paperMainService: Symbol('paperMainService'),
    liveMainService: Symbol('liveMainService'),
}

export const TYPES = {
    ...baseServices,
    ...mainServices,
}

export default TYPES;
