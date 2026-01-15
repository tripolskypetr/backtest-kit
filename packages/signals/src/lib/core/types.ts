/**
 * Dependency injection type symbols for signals library.
 *
 * Defines unique symbols for service registration and retrieval in the DI container.
 * Organized by service category: common, math, and history services.
 *
 * @module lib/core/types
 */

/**
 * Common service symbols.
 */
const commonServices = {
    /** Logger service for diagnostic output */
    loggerService: Symbol("loggerService"),
}

/**
 * Technical analysis service symbols.
 */
const mathServices = {
    /** 1-hour (LongTerm) technical analysis service */
    longTermMathService: Symbol('longTermMathService'),
    /** 30-minute (SwingTerm) technical analysis service */
    swingTermMathService: Symbol('swingTermMathService'),
    /** 15-minute (ShortTerm) technical analysis service */
    shortTermMathService: Symbol('shortTermMathService'),
    /** 1-minute (MicroTerm) technical analysis service */
    microTermMathService: Symbol('microTermMathService'),
    /** Order book analysis service */
    bookDataMathService: Symbol('bookDataMathService'),
}

/**
 * Candle history service symbols.
 */
const historyServices = {
    /** 15-minute candle history service */
    fifteenMinuteCandleHistoryService: Symbol('fifteenMinuteCandleHistoryService'),
    /** 1-hour candle history service */
    hourCandleHistoryService: Symbol('hourCandleHistoryService'),
    /** 1-minute candle history service */
    oneMinuteCandleHistoryService: Symbol('oneMinuteCandleHistoryService'),
    /** 30-minute candle history service */
    thirtyMinuteCandleHistoryService: Symbol('thirtyMinuteCandleHistoryService'),
}

/**
 * All service type symbols combined.
 */
export const TYPES = {
    ...commonServices,
    ...mathServices,
    ...historyServices,
}
