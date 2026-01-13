const commonServices = {
    loggerService: Symbol("loggerService"),
}

const baseServices = {
    contextService: Symbol('contextService'),
};

const privateServices = {
    runnerPrivateService: Symbol('runnerPrivateService'),
};

const publicServices = {
    runnerPublicService: Symbol('runnerPublicService'),
};

export const TYPES = {
    ...commonServices,
    ...baseServices,
    ...privateServices,
    ...publicServices,
}
