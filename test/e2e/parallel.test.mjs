import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * PARALLEL ТЕСТ #1: Одна стратегия торгует двумя символами параллельно (BTCUSDT и ETHUSDT)
 *
 * Проверяет:
 * - Изоляция состояния между (symbol, strategyName) парами
 * - Независимая обработка сигналов для каждого символа
 * - Корректная мемоизация ClientStrategy инстансов
 * - Независимое хранение данных (signal/schedule persistence)
 * - Независимая генерация отчетов (markdown reports)
 *
 * Сценарий:
 * - BTCUSDT: scheduled → opened → closed by TP
 * - ETHUSDT: scheduled → opened → closed by SL
 */
/**
 * PARALLEL ТЕСТ #2: Три символа торгуют параллельно одной стратегией
 *
 * Проверяет:
 * - Масштабируемость multi-symbol архитектуры
 * - Независимость ClientStrategy инстансов для каждой (symbol, strategyName) пары
 * - Корректность мемоизации с ключами `${symbol}:${strategyName}`
 * - Независимость persistence слоя (файлы именуются ${symbol}_${strategyName})
 *
 * Сценарий:
 * - BTCUSDT: TP
 * - ETHUSDT: SL
 * - SOLUSDT: time_expired
 */
