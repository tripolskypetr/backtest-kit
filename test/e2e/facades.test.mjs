import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  Schedule,
  Performance,
  Heat,
  Partial,
  listenDoneBacktest,
  listenError,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * FACADES PARALLEL TEST: Проверяет все публичные фасады с multi-symbol архитектурой
 *
 * Проверяет изоляцию данных для:
 * - Backtest (уже протестирован в parallel.test.mjs)
 * - Live (пропускаем - требует live режим)
 * - Schedule.getData(symbol, strategyName)
 * - Performance.getData(symbol, strategyName)
 * - Heat.getData(symbol, strategyName)
 * - Partial.getData(symbol, strategyName)
 * - PositionSize.getQuantity(symbol, price, strategyName)
 * - Constant (глобальные константы - не требует изоляции)
 * - Walker (пропускаем - требует walker schema setup)
 * - Optimizer (пропускаем - требует optimizer setup)
 *
 * Сценарий:
 * - Запускаем backtest для BTCUSDT и ETHUSDT параллельно
 * - Проверяем что все фасады корректно изолируют данные по (symbol, strategyName)
 */
