# TODO — исправление багов backtest-kit

По итогам аудита `./src` (полное чтение `ClientStrategy.ts` + math/helpers/utils/client). Приоритет: P0 — теряются деньги/сигналы молча, P1 — неверные расчёты/утечки состояния, P2 — API-ловушки и несоответствия, P3 — косметика.

**Статус: все пункты исправлены** (2026-07-02, ветка `fable-audit`). Регрессионные тесты: `test/spec/audit.test.mjs` (unit) и `test/e2e/audit.test.mjs` (e2e), подключены в `test/index.mjs`. Полный набор: 785 ok / 0 fail.

---

## P0 — молчаливая потеря сигналов и позиций

- [x] **Spread затирает дефолты в GET_SIGNAL_FN** — `src/client/ClientStrategy.ts`
  `...structuredClone(signal)` перенесён **перед** дефолтами `id`/`cost`/`priceOpen`. DTO с собственными `undefined`-ключами больше не роняет валидацию.
  Тест: e2e «signal DTO with explicit undefined keys opens a position».

- [x] **Whipsaw блокирует retry после sync-отказа** — `src/client/ClientStrategy.ts`
  `_lastPendingId` фиксируется только после **успешного** открытия (после sync-open) во всех 5 точках открытия: OPEN_NEW_PENDING_SIGNAL_FN, ACTIVATE_SCHEDULED_SIGNAL_FN, ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN, tick/_activatedSignal, PROCESS_SCHEDULED_SIGNAL_CANDLES_FN.
  Тест: e2e «risk-rejected deterministic signal id retries and opens once».

- [x] **Утечка risk-резервации** — `src/client/ClientStrategy.ts`
  `CALL_RISK_REMOVE_SIGNAL_FN` добавлен на все пути аборта после успешного `checkSignalAndReserve`:
  - sync-отказ: OPEN_NEW_PENDING_SIGNAL_FN, ACTIVATE_SCHEDULED_SIGNAL_FN, ACTIVATE_..._IN_BACKTEST_FN, tick/_activatedSignal, PROCESS_SCHEDULED_...(user-activated)
  - validate-throw после risk-check в GET_SIGNAL_FN: релиз в trycatch-fallback
  - **сверх плана**: релиз на всех путях отмены scheduled-сигнала (timeout / price_reject / user cancel, live и backtest) и на risk/stopped-отказах активации — раньше отменённый scheduled навсегда оставлял placeholder в riskMap.
  Известное исключение: `stopStrategy()` очищает scheduled без релиза (graceful shutdown, обычно процесс завершается) — при желании добить отдельно.

- [x] **WAIT_FOR_INIT_FN: ранний return убивает restore + onInit** — `src/client/ClientStrategy.ts`
  Ранние `return` заменены на скоуп-скип соответствующего блока + warn-лог. Mismatch у pending не срывает restore scheduled и `onInit`.
  Тест: e2e «pending mismatch does not skip scheduled restore».

## P1 — неверные расчёты и потеря состояния

- [x] **AVERAGE_BUY_FN: restore игнорирует signal.cost** — `cost: signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST` в AVERAGE_BUY_FN и validateAverageBuy.

- [x] **commitPartialProfitCost / commitPartialLossCost: недозакрытие** — `src/function/strategy.ts`
  Зафиксирована семантика: `percentToClose` — процент от **remaining cost basis** (как в PARTIAL_*_FN). Конвертация долларов идёт через `getTotalCostClosed` (remaining), а не через total invested; `cost` в Broker-коммитах percent-вариантов тоже от remaining. Докстринг `investedCostToPercent` синхронизирован.
  Тест: e2e «commitPartialProfitCost closes exact dollar amounts after prior partial» ($300 − $150 − $75 → ровно $75).

- [x] **slPriceToPercentShift / tpPriceToPercentShift: зеркальная цена** — добавлен обязательный параметр `position`, дистанция знаковая (breaking change). Вызовы в strategy.ts / Backtest.ts / Live.ts переведены на `originalPriceStopLoss/TakeProfit ?? ...` (ClientStrategy применяет shift от оригинального уровня).
  Тест: unit roundtrip по обе стороны entry.

- [x] **percentValue: инвертированная формула** — `(today / yesterday - 1) * 100` (breaking change: и направление, и масштаб — теперь процент, как говорит имя).

- [x] **roundTicks: краш на целочисленном tickSize** — убран Intl; precision из `toString()` с обработкой экспоненциальной формы; явный throw на невалидном tickSize. Тест: 1/10/25/1000/0.1/1e-8/1e-9.

- [x] **PROCESS_COMMIT_QUEUE_FN: молчаливый drop** — семантика оставлена at-most-once; при отсутствии `_pendingSignal` дроп логируется warn (logger + console) со списком действий.

## P2 — API-ловушки и несоответствия

- [x] **getBreakeven vs BREAKEVEN_FN: разные пороги** — `CC_BREAKEVEN_THRESHOLD` добавлен в BREAKEVEN_FN и validateBreakeven (вариант «конфиг работает везде»); докстринг теперь честен.

- [x] **Risk-отказ user-активации без события** — в tick() и PROCESS_SCHEDULED_SIGNAL_CANDLES_FN эмитятся `cancel-scheduled` commit + `onScheduleEvent("cancelled", "user")`.

- [x] **Фантомная позиция при крэше** — pending персистится только внутри OPEN_NEW_PENDING_SIGNAL_FN **после** подтверждения sync-open; tick() больше не пишет сигнал на диск до подтверждения.

- [x] **ClientSizing: minPositionSize пробивает риск-кап** — порядок: min → maxPositionPercentage → maxPositionSize (капы последними). Тест: unit «minPositionSize cannot exceed maxPositionPercentage cap».

- [x] **getTotalPercentClosed / getTotalCostClosed: инверсия имён** — добавлены корректные алиасы `getTotalPercentHeld` / `getRemainingCostBasis` (экспортированы), старые помечены `@deprecated` (без breaking change).

- [x] **percentDiff: sentinel 100** — равные значения → 0, ноль против ненуля → Infinity; дефолтные параметры убраны.

- [x] **ClientFrame: тихая обрезка backtest по 00:00 UTC** — клампится по `new Date()` (текущий момент), а не по началу суток.

## P3 — косметика и защита от edge cases

- [x] **Деление на ноль в progressPercent** — хелпер `GET_PROGRESS_PERCENT_FN` (дистанция ≤ 0 → 100, клампинг [0, 100] с обеих сторон) во всех 8 точках live/backtest.

- [x] **pendingAt при backtest-активации: комментарий vs код** — комментарий приведён к коду (`candle.timestamp`).

- [x] **getPositionPartials / getPositionEntries: тип `Promise<...> | null`** — → `Promise<... | null>`.

- [x] **Двойная risk-резервация immediate-сигналов** — check остался один, в GET_SIGNAL_FN (до валидации — так rejection-события и статистика ведут себя как раньше); дубль в OPEN_NEW_PENDING_SIGNAL_FN убран. Утечка при validate-throw закрыта релизом в fallback.
  Примечание: вариант «check только в OPEN» был опробован и откатан — он ломал rejection-статистику для сигналов, которые не проходят валидацию (risk обязан видеть каждый кандидат-сигнал до валидации).

- [x] **toPlainString калечит snake_case** — lookaround-границы `(?<![\w])_..._(?![\w])` для всех трёх underscore-вариантов.

- [x] **waitForCandle: лаг до 5с + вечные интервалы** — `setTimeout` до следующей границы интервала (+25мс guard, re-arm при раннем срабатывании), `timer.unref()` чтобы не держать процесс.

- [x] **Комментарий Windows-ветки writeFileAtomic** — комментарии честно описывают прямую запись (best-effort, не атомарно).

---

## Аудит markdown-сервисов (2026-07-02): ошибки в математике

Полное чтение 13 сервисов `src/lib/services/markdown/*` + хелпера `getPriceProfile`. Ядро статистики (Sharpe/Sortino/Calmar/Recovery, mark-to-market equity drawdown, геометрическая аннуализация, стрики, медианы, перцентили, OLS-тренд) — корректно и согласовано между Backtest/Live/Heat. Найдено:

- [x] **P1: BacktestMarkdownService.waitForInit — история с диска сливается в обратном порядке** — `src/lib/services/markdown/BacktestMarkdownService.ts`
  `LOAD_PERSISTED_CLOSED_FN` сортирует oldest-first, а merge делает `push` в хвост newest-first списка `_signalList` (комментарий говорил «unshifted in», код пушил). После рестарта с включённой персистенцией Storage исторический сегмент лежал по возрастанию внутри убывающего списка:
  1) trim `length = CAP` выбрасывал **новейшую** историю вместо старейшей;
  2) порядок строк таблицы отчёта нарушен;
  3) avgConsecutiveWinPnl / avgConsecutiveLossPnl искажались на стыке live-сегмента и истории (полный реверс сохраняет мультимножество стриков, но стрики, пересекающие шов между сегментами, склеивались/рвались не там).
  Не затронуты: equity curve / maxDrawdown / Calmar / Recovery / price profile / аннуализация (сортируют явно). Live и Heat реплеят историю через unshift — у них бага нет.
  Фикс: итерация persisted в обратном порядке (newest-first) при push.

- [x] **P2: Backtest/Live getData — 0% вместо N/A при пустом валидном наборе**
  Backtest: если все сигналы отфильтрованы как битые (нет валидных pendingAt/closeTimestamp), avgPnl/winRate/totalPnl возвращались `0` вместо `null`. Live: сессия без единого закрытого трейда (только idle-события) показывала «Win rate 0.00%, Avg PNL +0.00%» вместо N/A — тест `Live.getData returns null for invalid metrics` проходил только из-за гонки (getData успевал раньше первого idle-события). Фикс: ранний возврат null-модели при `totalSignals === 0` / `totalClosed === 0` (счётчики 0, все метрики null, eventList/signalList сохраняются для таблицы).

- [x] **P3: LiveMarkdownService.addClosedEvent — округление длительности до целых минут**
  `Math.round(durationMs / 60000)` обнулял колонку duration для трейдов короче 30с. ScheduleMarkdownService уже был исправлен на дробные минуты — выровнено. Статистика avgDuration не была затронута (считается от сырых timestamp).

- [x] **P3: WalkerMarkdownService — легенда противоречит коду выбора лучшей стратегии**
  Легенда утверждала «if the statistic is one for which "lower is better", the smallest» — на деле walker всегда максимизирует (`metricValue > bestMetric`, `WalkerMetric` документирован как «higher is always better», stdDev среди выбираемых метрик нет). Сортировка топ-N по убыванию корректна; исправлен текст легенды. (Первоначальная гипотеза «сортировка инвертирована для lower-is-better метрик» не подтвердилась.)

- [x] **P3: HeatMarkdownService.calculateSymbolStats — докстринг разошёлся с кодом**
  Заявлены «population standard deviation», «requires ≥ 2 signals», «winRate = winCount / totalTrades»; код использует sample stddev (N−1), гейт `MIN_SIGNALS_FOR_RATIOS = 10` и исключает break-even из winRate; maxDrawdown — это mark-to-market drawdown compounded equity curve, а не «cumulative loss streak». Код прав — исправлена документация.

Проверено и признано корректным (без изменений): getPriceProfile (OLS log-цены, R² = r², флэт-серия → sideways), PerformanceMarkdownService (перцентили с линейной интерполяцией, sample stddev), ScheduleMarkdownService (id-matched знаменатели activation/cancellation rate), RiskMarkdownService / SyncMarkdownService / PartialMarkdownService / StrategyMarkdownService / BreakevenMarkdownService / MaxDrawdownMarkdownService / HighestProfitMarkdownService (счётчики и аккумуляция, математики нет), портфельная агрегация Heat (pooled Sharpe/Sortino, trade-count-weighted средние, хронологическая pooled equity curve).

---

## Замечания по совместимости

Breaking changes (кандидаты на major bump):
1. `percentValue` — новая формула и масштаб (было `yesterday/today - 1`, стало `(today/yesterday - 1) * 100`).
2. `slPriceToPercentShift` / `tpPriceToPercentShift` — обязательный 4-й аргумент `position`.
3. `percentDiff` — честные 0/Infinity вместо sentinel 100, убраны дефолтные аргументы.
4. Breakeven срабатывает позже на `CC_BREAKEVEN_THRESHOLD` (по умолчанию 0.2%) — теперь конфиг реально участвует в BREAKEVEN_FN.

---

## Аудит packages/signals/src (исправлено)

- [x] **P0: `[object Promise]` в LLM-отчётах — пропущенные `await`**
  `formatPrice`/`formatQuantity` — async. В `HourCandleHistoryService` Open/High/Low/Close/Volume рендерились как `[object Promise] USD` (5 полей), в `OneMinuteCandleHistoryService` и `ThirtyMinuteCandleHistoryService` — Volume. FifteenMinute был корректен. Фикс: добавлены `await`.

- [x] **P0: колонка Timestamp = время генерации отчёта во всех 4 math-сервисах**
  `date: new Date()` — все 30–48 строк «Historical Data» имели одинаковый Timestamp (момент вызова), LLM не мог привязать строки ко времени. Фикс: `date: new Date(candle.timestamp)` (Micro/Short/Swing/Long). `timestamp: new Date()` в BookData оставлен — там это честное время снапшота стакана.

- [x] **P1: `volumeTrendRatio` считался, но не выводился** (Micro/Short/Long) — добавлена колонка «Volume Trend Ratio» + строки в Data Sources. В LongTerm заодно убраны два `new SMA(6)` на каждую строку (заменены обычным средним, значения идентичны).

- [x] **P1: LongTerm `atr14_raw` — дубликат `atr14`** — колонка, поле интерфейса и строка Data Sources удалены; для ATR(20) убран ошибочный ярлык «Raw».

- [x] **P1: Фибоначчи 127.2%/161.8% ниже low без пометки** (Short/Long; в Swing одноимённые уровни — вверх от high). Уровни переименованы в «127.2% (downside)» / «161.8% (downside)», в Data Sources добавлено пояснение.

- [x] **P1: SwingTerm volatility не оконная** — RMS изменений считался от первой свечи истории (метрика зависела от длины данных, O(n²) на строку). Фикс: окно `VOLATILITY_WINDOW = 20`, guard `prevPrice <= 0`; Data Sources уточнены. Проверено: значение строки не зависит от длины предыстории.

- [x] **P2: LongTerm `getData` не резал до TABLE_ROWS_LIMIT** — slice перенесён внутрь `generateAnalysis` (симметрично остальным сервисам), лишний slice в `getReport` убран.

- [x] **P2: BookData — пустой стакан давал «0 USD» вместо N/A** — bestBid/bestAsk/midPrice/spread/depthImbalance теперь `null` при пустой стороне (типы обновлены на `number | null`); сортировка больше не мутирует входные массивы; удалён неиспользуемый импорт `ttl`.

- [x] **P2: MicroTerm calculateVolumeMetrics маскировал отсутствие данных** — `volumeSma5: 0` / `volumeRatio: 1` при недоступном SMA заменены на `null` (колонки печатают N/A).

- [x] **P3: мелочи** — guard деления на 0 в calculatePriceChanges (Micro); проверка `middle !== 0` в bollingerWidth (Short, выравнено с Micro/Swing); доки: Bollinger Position может выходить за 0–100%, фиб-окно Short ограничено 144 свечами (а не 288), комментарий WARMUP про StochRSI(14); убран бессмысленный `await` на строке в other.function.ts.

Проверено и признано корректным (без изменений): `getResult()` trading-signals v6 возвращает null (не бросает) — обвязка isUnsafe корректна; масштабы pdi/mdi (×100), StochRSI (×100), Stochastic K/D (как есть) — проверены эмпирически; TTL `Cache.fn` идёт по виртуальному времени executionContext (backtest-safe); trycatch-обёртки commit-функций глотают ошибку и чистят кэш — осознанный дизайн.
