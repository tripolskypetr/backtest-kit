/**
 * Service container initialization and export for signals library.
 *
 * Initializes the DI container, injects all registered services,
 * and exports them as a unified 'signal' object for internal use.
 *
 * This module:
 * 1. Imports service registrations from './core/provide'
 * 2. Injects all services from DI container
 * 3. Initializes DI container
 * 4. Exports combined service object
 * 5. Attaches to globalThis for debugging (non-production only)
 *
 * @module lib/index
 */

import "./core/provide";

import { init, inject } from "./core/di";
import { TYPES } from "./core/types";
import SwingTermMathService from "./services/math/SwingTermMathService";
import LongTermMathService from "./services/math/LongTermMathService";
import ShortTermMathService from "./services/math/ShortTermMathService";
import MicroTermMathService from "./services/math/MicroTermMathService";
import FifteenMinuteCandleHistoryService from "./services/history/FifteenMinuteCandleHistoryService";
import HourCandleHistoryService from "./services/history/HourCandleHistoryService";
import OneMinuteCandleHistoryService from "./services/history/OneMinuteCandleHistoryService";
import ThirtyMinuteCandleHistoryService from "./services/history/ThirtyMinuteCandleHistoryService";
import BookDataMathService from "./services/math/BookDataMathService";
import LoggerService from "./services/common/LoggerService";

/**
 * Common services.
 */
const commonServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};

/**
 * Technical analysis services.
 */
const mathServices = {
  swingTermMathService: inject<SwingTermMathService>(
    TYPES.swingTermMathService
  ),
  longTermMathService: inject<LongTermMathService>(TYPES.longTermMathService),
  shortTermMathService: inject<ShortTermMathService>(
    TYPES.shortTermMathService
  ),
  microTermMathService: inject<MicroTermMathService>(
    TYPES.microTermMathService
  ),
  bookDataMathService: inject<BookDataMathService>(TYPES.bookDataMathService),
};

/**
 * Candle history services.
 */
const historyServices = {
  fifteenMinuteCandleHistoryService: inject<FifteenMinuteCandleHistoryService>(
    TYPES.fifteenMinuteCandleHistoryService
  ),
  hourCandleHistoryService: inject<HourCandleHistoryService>(
    TYPES.hourCandleHistoryService
  ),
  oneMinuteCandleHistoryService: inject<OneMinuteCandleHistoryService>(
    TYPES.oneMinuteCandleHistoryService
  ),
  thirtyMinuteCandleHistoryService: inject<ThirtyMinuteCandleHistoryService>(
    TYPES.thirtyMinuteCandleHistoryService
  ),
};

/**
 * Combined service container for internal library use.
 * Contains all registered services: common, math, and history.
 */
const signal = {
  ...commonServices,
  ...mathServices,
  ...historyServices,
};

// Initialize DI container
init();

export { signal };

// Attach to global for debugging (non-production)
Object.assign(globalThis, { signal });

export default signal;
