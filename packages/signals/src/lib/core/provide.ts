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


{
  provide(TYPES.swingTermMathService, () => new SwingTermMathService());
  provide(TYPES.longTermMathService, () => new LongTermMathService());
  provide(TYPES.shortTermMathService, () => new ShortTermMathService());
  provide(TYPES.microTermMathService, () => new MicroTermMathService());
  provide(TYPES.bookDataMathService, () => new BookDataMathService());
}

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
