/**
 * Service registration for signals library DI container.
 *
 * Registers all service factories with the dependency injection container.
 * Services are lazily instantiated on first injection.
 *
 * Service categories:
 * - Common: Logger service
 * - Math: Technical analysis services (MicroTerm, ShortTerm, SwingTerm, LongTerm, OrderBook)
 * - History: Candle history services (1m, 15m, 30m, 1h)
 *
 * @module lib/core/provide
 */

import LongTermMathService from "../services/math/LongTermMathService";
import MicroTermMathService from "../services/math/MicroTermMathService";
import ShortTermMathService from "../services/math/ShortTermMathService";
import SwingTermMathService from "../services/math/SwingTermMathService";
import FifteenMinuteCandleHistoryService from "../services/history/FifteenMinuteCandleHistoryService";
import HourCandleHistoryService from "../services/history/HourCandleHistoryService";
import OneMinuteCandleHistoryService from "../services/history/OneMinuteCandleHistoryService";
import ThirtyMinuteCandleHistoryService from "../services/history/ThirtyMinuteCandleHistoryService";
import BookDataMathService from "../services/math/BookDataMathService";
import { provide } from "./di";
import { TYPES } from "./types";
import LoggerService from "../services/common/LoggerService";

// Register common services
{
  provide(TYPES.loggerService, () => new LoggerService());
}

// Register technical analysis services
{
  provide(TYPES.swingTermMathService, () => new SwingTermMathService());
  provide(TYPES.longTermMathService, () => new LongTermMathService());
  provide(TYPES.shortTermMathService, () => new ShortTermMathService());
  provide(TYPES.microTermMathService, () => new MicroTermMathService());
  provide(TYPES.bookDataMathService, () => new BookDataMathService());
}

// Register candle history services
{
  provide(
    TYPES.fifteenMinuteCandleHistoryService,
    () => new FifteenMinuteCandleHistoryService()
  );
  provide(TYPES.hourCandleHistoryService, () => new HourCandleHistoryService());
  provide(
    TYPES.oneMinuteCandleHistoryService,
    () => new OneMinuteCandleHistoryService()
  );
  provide(
    TYPES.thirtyMinuteCandleHistoryService,
    () => new ThirtyMinuteCandleHistoryService()
  );
}
