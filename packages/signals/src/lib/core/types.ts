const commonServices = {
    loggerService: Symbol("loggerService"),
}

const mathServices = {
    longTermMathService: Symbol('longTermMathService'),
    swingTermMathService: Symbol('swingTermMathService'),
    shortTermMathService: Symbol('shortTermMathService'),
    microTermMathService: Symbol('microTermMathService'),
    bookDataMathService: Symbol('bookDataMathService'),
}

const historyServices = {
    fifteenMinuteCandleHistoryService: Symbol('fifteenMinuteCandleHistoryService'),
    hourCandleHistoryService: Symbol('hourCandleHistoryService'),
    oneMinuteCandleHistoryService: Symbol('oneMinuteCandleHistoryService'),
    thirtyMinuteCandleHistoryService: Symbol('thirtyMinuteCandleHistoryService'),
}

export const TYPES = {
    ...commonServices,
    ...mathServices,
    ...historyServices,
}
