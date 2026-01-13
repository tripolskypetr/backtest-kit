const mathServices = {
    longTermMathService: Symbol.for('longTermMathService'),
    swingTermMathService: Symbol.for('swingTermMathService'),
    shortTermMathService: Symbol.for('shortTermMathService'),
    microTermMathService: Symbol.for('microTermMathService'),
    bookDataMathService: Symbol.for('bookDataMathService'),
}

const historyServices = {
    fifteenMinuteCandleHistoryService: Symbol.for('fifteenMinuteCandleHistoryService'),
    hourCandleHistoryService: Symbol.for('hourCandleHistoryService'),
    oneMinuteCandleHistoryService: Symbol.for('oneMinuteCandleHistoryService'),
    thirtyMinuteCandleHistoryService: Symbol.for('thirtyMinuteCandleHistoryService'),
}

export const TYPES = {
    ...mathServices,
    ...historyServices,
}
