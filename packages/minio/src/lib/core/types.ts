const baseServices = {
    loggerService: Symbol('loggerService'),
    redisService: Symbol('redisService'),
    minioService: Symbol('minioService'),
};

const dataServices = {
    candleDataService: Symbol('candleDataService'),
    signalDataService: Symbol('signalDataService'),
    scheduleDataService: Symbol('scheduleDataService'),
    strategyDataService: Symbol('strategyDataService'),
    riskDataService: Symbol('riskDataService'),
    partialDataService: Symbol('partialDataService'),
    breakevenDataService: Symbol('breakevenDataService'),
    storageDataService: Symbol('storageDataService'),
    notificationDataService: Symbol('notificationDataService'),
    logDataService: Symbol('logDataService'),
    measureDataService: Symbol('measureDataService'),
    intervalDataService: Symbol('intervalDataService'),
    memoryDataService: Symbol('memoryDataService'),
    recentDataService: Symbol('recentDataService'),
    stateDataService: Symbol('stateDataService'),
    sessionDataService: Symbol('sessionDataService'),
}

const connectionServices = {
    logConnectionService: Symbol('logConnectionService'),
    notificationConnectionService: Symbol('notificationConnectionService'),
    storageConnectionService: Symbol('storageConnectionService'),
}

export const TYPES = {
    ...baseServices,
    ...dataServices,
    ...connectionServices,
}

export default TYPES;
