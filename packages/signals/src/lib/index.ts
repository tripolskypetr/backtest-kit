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

const signal = {
  ...mathServices,
  ...historyServices,
};

init();

export { signal };

Object.assign(globalThis, { signal });

export default signal;
