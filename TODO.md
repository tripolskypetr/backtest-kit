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
  ~~Известное исключение: `stopStrategy()` очищает scheduled без релиза (graceful shutdown, обычно процесс завершается) — при желании добить отдельно.~~ **Закрыто в четвёртом проходе** (см. «stopStrategy: scheduled-сигнал через cancel-пайплайн»).

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

## Аудит корневого ./src, второй проход (2026-07-03): исправлено

Зоны, не покрытые первым проходом: logic-сервисы (Backtest/Live/Walker private), connection/core-сервисы, ClientExchange, ClientFrame, Persist, Memory, report-сервисы, utils, classes/Exchange. Тесты: 4 новых в `test/spec/audit.test.mjs`, обновлены 3 heat-теста (кодировали баговое поведение off-by-one). Полный набор: 794 ok / 0 fail.

### P1

- [x] **`getAggregatedTrades` с `limit` — бесконечный цикл на пустой истории** — `src/client/ClientExchange.ts`
  Пагинация назад не имела guard'а: до листинга символа адаптер вечно возвращает `[]`, окно уходило к эпохе и в отрицательные timestamps. Фикс: стоп после 10 подряд пустых окон (warn + частичный результат) и при `windowStart <= 0`.
  Тест: «getAggregatedTrades: empty history terminates with partial result».

- [x] **Infinity-сигнал у края данных ронял процесс через `process.exit(-1)`** — `src/lib/services/logic/private/BacktestLogicPrivateService.ts`
  Первый чанк RUN_OPENED_CHUNK_LOOP_FN запрашивает CC_MAX_CANDLES_PER_REQUEST (1000) минут вперёд; `getNextCandles` даёт `[]`, если конец окна за `Date.now()`. Сигнал с `minuteEstimatedTime: Infinity`, открытый в последние ~16.6 ч фрейма «до сейчас», давал фатальную ошибку. Фикс: `null` → `{type: "skip"}` (симметрично конечным сигналам и scheduled-Infinity). Бонус: RUN_INFINITY_CHUNK_LOOP_FN теперь получает initialCandles от вызывающего — CLOSE_PENDING_FN больше не может получить пустой массив на первой итерации.

- [x] **Таймфреймы фрейма замораживались навсегда** — `src/lib/services/connection/FrameConnectionService.ts` + `src/classes/{Backtest,Walker}.ts`
  `getFrame` мемоизирован без инвалидации, `ClientFrame.getTimeframe` — singleshot: клампинг `endDate → now` фиксировался при первом запуске; повторные бектесты в долгоживущем процессе молча не видели новые данные. Фикс: `FrameConnectionService.clear(frameName?)`, вызывается в per-run блоках Backtest.run и Walker.run.

### P2

- [x] **Off-by-one: после закрытия сигнала терялся лишний таймфрейм** — `src/lib/services/logic/private/BacktestLogicPrivateService.ts`
  Skip-цикл `< closeTimestamp` + безусловный `i++` съедали первый фрейм ≥ closeTimestamp: при внесеточном закрытии (:07 при 15m-фреймах) ре-энтри задерживался на целый интервал против live. Фикс: `<= closeTimestamp` + `continue` (perf-эмит сохранён). Heat-тесты обновлены: 2 дневных фрейма теперь дают 2 трейда на символ, а не 1.

- [x] **Пустой timeframe → TypeError → `process.exit(-1)`** — `src/client/ClientFrame.ts`
  `startDate` в будущем или `startDate > endDate` давали невнятный краш. Фикс: явный throw с описанием диапазона (бросается до try в `run()`, уходит вызывающему, а не в exit).
  Тест: «frame: future startDate throws a clear empty-range error».

- [x] **`MemoryPersistInstance.waitForInit` пересканировал диск на каждую операцию** — `src/classes/Memory.ts`
  Local-вариант был singleshot, Persist — нет: каждый read/write/search перечитывал все файлы бакета с ребилдом BM25 (O(N) fs-чтений на операцию) + гонка могла воскресить в индексе удалённую запись. Фикс: singleshot.

- [x] **`removeMemoryData` несуществующего id бросал вместо no-op** — `src/classes/Persist.ts`
  `readValue` бросает «Entity not found», а код проверял `if (data)` в расчёте на null. Фикс: `hasValue`-гард (идемпотентно, как Local/Dummy).

### P3

- [x] **Округление длительности до целых минут** — `BacktestReportService`, `LiveReportService`, `ScheduleReportService` (×2), `classes/Notification.ts` (×2) — выровнено с фиксом LiveMarkdownService: дробные минуты.

- [x] **BM25-нормализация вырезала цифры** — `src/utils/createSearchIndex.ts`: `[^\p{L}\s]` → `[^\p{L}\p{N}\s]` (числовые токены снова индексируются и ищутся); guard `avgLen || 1` от NaN при пустых индекс-строках.
  Тест: «memory search: numeric tokens are indexed and searchable».

- [x] **`disposeSignal` — коллизия префиксов** — `src/classes/Memory.ts`: сепаратор ключа `_` → `\u0000` (id `sig` больше не диспозит бакеты `sig_2`).

- [x] **Копипаст-метки логов** — `ExchangeConnectionService.formatPrice/formatQuantity` («getAveragePrice») и `ClientExchange.formatPrice/formatQuantity` («binanceService») исправлены.

- [x] **Retry-цикл `GET_CANDLES_FN`** — `i !== COUNT` → `i < COUNT` (нет бесконечного цикла на невалидном конфиге); `throw lastError ?? new Error(...)` вместо `throw undefined` при `RETRY_COUNT = 0`.

### Дополнение: classes/Exchange.ts (2026-07-03)

- [x] **P1: `ExchangeInstance.getAggregatedTrades` — та же бесконечная пагинация, что в ClientExchange** — `src/classes/Exchange.ts`
  Файл — почти полный дубликат ClientExchange для вызовов вне execution-контекста (GUI, warm-скрипты); копия цикла без guard'а осталась незакрытой. Фикс зеркальный: стоп после 10 подряд пустых окон + `windowStart <= 0`.
  Тест: «Exchange.getAggregatedTrades: empty history terminates outside execution context».

- [x] **P3: докстринги `getRawCandles` лгали про Date.now()** — заявляли «Uses Date.now() instead of execution context when», код использует `GET_TIMESTAMP_FN` (context.when при активном контексте, иначе wall-clock). Исправлены оба (ExchangeInstance + ExchangeUtils).

Замечания без изменений: `ExchangeInstance.getCandles` не ретраит (ClientExchange ретраит CC_GET_CANDLES_RETRY_COUNT раз) — для warm-пайплайна ретрай даёт внешний `retry(2)` в cacheCandles. Дублирование ClientExchange ↔ ExchangeInstance — осознанный дизайн (SRP, линейное чтение модулей); правки багов применять в обе копии.

Проверено и признано корректным (без изменений): LiveLogicPrivateService, WalkerLogicPrivateService (стоп-семантика «гасит весь walker» консистентна с `Walker.stop`), MergeRisk (rollback-контракт задокументирован), validateCandles, Candle-мьютекс/spinLock, PersistCandleInstance/PersistBase, чанк-математика `getCandles`/`getRawCandles` (все 5 комбинаций параметров + look-ahead-защита, проверено в обеих копиях — ClientExchange и ExchangeInstance), выравнивание ClientFrame к минутной сетке, cache.ts (warm/check-пайплайн), PriceMetaService/TimeMetaService.

Не покрыто вторым проходом (кандидаты на следующий): StrategyCoreService, крупные `classes/` (Broker ~2.8k, Recent ~1k, Session, Storage, Sync), `function/` кроме cache/strategy, ActionConnectionService/ClientAction.

---

## Аудит корневого ./src, пятый проход (2026-07-03): ClientStrategy.ts целиком — исправлено

Зона — полное чтение `src/client/ClientStrategy.ts` (9k строк): state-машина tick/backtest, все FN-хелперы, deferred-дренажи, персист. План фиксов — `./PLAN.md`. Тесты: +3 e2e-регрессионных. Полный набор: 800 ok / 0 fail.

- [x] **P2: терминальные дропы scheduled на activation-путях — молча, мимо брокера (8 мест)** — `src/client/ClientStrategy.ts`
  Канал брокера — `scheduleEventSubject` → `Broker.commitScheduleCancelled` → адаптер снимает реальный resting order. На price-активации (`ACTIVATE_SCHEDULED_SIGNAL_FN` live + `ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN`) ветки stopped/risk-reject не эмитили НИЧЕГО, ветки sync-reject — только commit (мимо брокера). Плюс два sync-reject в user-активации (tick + backtest inline) — тоже только commit. Итог в live: ордер осиротевал на бирже; в backtest статистика отмен (ScheduleMarkdownService) не видела событие. Все 8 мест выровнены на донор-паттерн risk-reject ветки user-активации: пара `CALL_SCHEDULE_EVENT_FN("cancelled", ..., "user")` + commit `cancel-scheduled` после релиза risk-резервации. Reason остаётся `"user"` (расширение `StrategyCancelReason` — breaking change без необходимости; различение через `note`).

- [x] **P2: отказ активации в backtest ронял весь прогон фаталом «no pending signal after scheduled activation»** — `src/client/ClientStrategy.ts` (4 ветки, вскрыто новым регрессионным тестом)
  `PROCESS_SCHEDULED_SIGNAL_CANDLES_FN` игнорировал `false` от `ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN` и возвращал `outcome: "activated"` без pending-сигнала; ветки stopped/risk/sync-reject user-активации возвращали `"pending"` при уже занулённом scheduled. В обоих случаях `BACKTEST_FN` бросал фатал — **BacktestLogicPrivateService прерывал весь backtest** («Fatal error — backtest sequence broken»). Теперь все четыре ветки возвращают корректный `cancelled`-результат (`reason: "user"`) с tick-callbacks — backtest продолжается штатно.

- [x] **P2: гонка stopStrategy × setScheduledSignal — затирание отложенной отмены** — комментарии, код не менялся
  Окно: tick держит ссылку на scheduled, на await-точке `stopStrategy` конвертирует его в `_cancelledSignal`, терминальная ветка активации доходит до `setScheduledSignal(null)` — инвариант-очистка стирает отложенную отмену. После фикса эмиссий выше каждая такая ветка эмитит cancel-события синхронно и сама — затирание из бага превратилось в дедупликацию против двойной эмиссии (ветка + дренаж). Связка зафиксирована комментариями в `setScheduledSignal` и в ветках.

- [x] **P4: доки** — `averageBuy` докстринг обещал «simple arithmetic mean», фактическая формула — cost-weighted harmonic mean (`getEffectivePriceOpen`: Σcost / Σ(cost/price) с реплеем partial-закрытий); комментарии «retry on next tick» у sync-reject открытия получили оговорку про границу interval (`_lastSignalTimestamp` уже потреблён в `GET_SIGNAL_FN` — для "1h" ретрай через час); `WAIT_FOR_INIT_FN` — комментарий, почему у restore `strategyData` нет context-сверки (в снапшоте нет полей контекста, дефолтный адаптер ключуется тем же triple).

Тесты: e2e «backtest price-activation risk-reject emits cancelled schedule event» (риск-отказ на wick-активации → событие + backtest не падает), «live price-activation risk-reject emits cancelled schedule event» (tick #1 scheduled → цена касается priceOpen → риск-отказ → событие на брокерском канале), «live price-activation sync-reject notifies broker channel» (throw в `listenSync` → отказ брокера → событие). Существующий «stopStrategy routes scheduled signal through cancel pipeline» — зелёный (страховка дедупликации).

~~Отложено до решения продукта (PLAN.md §5)~~ — закрыто решениями продукта (2026-07-03), см. блок «Решения продукта» ниже.

Дочистка после повторного полного чтения (2026-07-03, 800 ok / 0 fail):

- [x] **P4: fallback `cost` игнорировал `signal.cost` (8 копий)** — `src/helpers/getTotalClosed.ts`, `src/helpers/toProfitLossDto.ts`, `src/client/ClientStrategy.ts` (PARTIAL_PROFIT_FN, PARTIAL_LOSS_FN, validatePartialProfit, validatePartialLoss, getPositionInvestedCost, getPositionEntries)
  При отсутствующем/пустом `_entry` (сигнал из старой персистенции) totalInvested падал на константу `CC_POSITION_ENTRY_COST`, игнорируя кастомный `signal.cost` — портил долларовый базис PnL/партиалов. `AVERAGE_BUY_FN`/`validateAverageBuy` были исправлены ранее; выровнены все оставшиеся копии на `signal.cost ?? CC_POSITION_ENTRY_COST`.

- [x] **P4: жёстко зашитый `backtest=false` в pending-мониторе tick()** — `RETURN_PENDING_SIGNAL_ACTIVE_FN(..., false)` → `execution.context.backtest`. В штатном backtest-потоке ветка недостижима (Infinity-холды идут чанками через `backtest()`), но прямой вызов `tick` с pending в backtest-режиме записал бы `_peak`/`_fall` в live-персист.

- [x] **P4 доки**: `getTotalPercentClosed`/`getTotalCostClosed` («Returns 100/totalInvested if no pending» → фактический `null`); `getPositionHighestProfitBreakeven` (докстринг был скопирован от minutes-метода — теперь описывает возвращаемый boolean «пик покрыл breakeven-порог»); `activateScheduled` («at the current price» → зафиксировано фактическое поведение: базис входа остаётся scheduled `priceOpen`, риск-проверка — по текущей цене).

Решения продукта (2026-07-03), исполнено (802 ok / 0 fail):

- [x] **Retry sync/risk-отказа открытия → честный next-tick** (решение: откатывать троттл). Ветки risk-reject в `GET_SIGNAL_FN` и sync-reject в `OPEN_NEW_PENDING_SIGNAL_FN` сбрасывают `_lastSignalTimestamp = null` — отклонённый вход ретраится на следующем tick, а не на следующей границе interval (для "1h" — до часа молчания). Риск-валидации при этом гоняются на каждом retry-tick до успеха — осознанный трейд-офф. Комментарии/докстринг `CALL_SIGNAL_SYNC_OPEN_FN` приведены к новой семантике.
  Тесты: e2e «sync-rejected open retries on next tick» и «risk-rejected open retries on next tick» (interval "1h", tick #1 отказ → tick #2 через минуту открывает; без отката второй tick был бы idle).

- [x] **`activateScheduled` — семантика подтверждена**: вызов означает «биржа исполнила НАШ resting order» (филл подтверждён адаптером out-of-band, например по вику, которого VWAP не показал) — базис входа `priceOpen` и есть реальная цена филла, PnL честный. Докстринг переписан под эту семантику; код не менялся. Асимметрия цены в `opened`-событии (live — currentPrice, backtest-inline — priceOpen) при этой семантике остаётся косметической — payload сигнала несёт priceOpen в обоих случаях.

- [x] **Risk-reject при уже исполненном лимитнике — adapter-side, задокументировано**: в докстринг `Broker.commitScheduleCancelled` добавлен параграф об обязанности адаптера проверять фактический статус ордера перед снятием (cancel может гоняться с реальным филлом; исполненный ордер — позиция на стороне адаптера, reconcile через `onOrderCheck`/`onSignalActivePing`). Ядро этот кейс не моделирует — с его стороны сигнал терминально отменён.

- [x] **Epsilon в капе партиалов**: строгий `>` → `> totalInvested * (1 + 1e-9)` во всех 4 копиях (`PARTIAL_PROFIT_FN`, `PARTIAL_LOSS_FN`, `validatePartialProfit`, `validatePartialLoss`) — закрытие ровно оставшихся 100% больше не отклоняется fp-дрейфом.

Оставлено как есть (решение продукта): onWrite получает то raw `ISignalRow`, то `TO_PUBLIC_SIGNAL` — по контракту (`Strategy.interface.ts`) допустимо, унификация не требуется.

Order-ping для scheduled + переименование (2026-07-03, 804 ok / 0 fail):

- [x] **onSignalPing теперь пингует и scheduled-сигнал; в `SignalPingContract` добавлено поле `type: "schedule" | "active"`**
  Раньше order-ping (`syncPendingSubject` → `Broker.onOrderCheck` / `Action.onOrderCheck`) шёл только для pending-позиции — resting-ордер scheduled-сигнала никто не сверял с биржей. Теперь в live-tick перед проверкой timeout/price-активации выполняется `CALL_SCHEDULED_SIGNAL_PING_FN` (type "schedule"); отказ (false/throw) — терминальная отмена scheduled через новый `CANCEL_SCHEDULED_SIGNAL_AS_CLOSED_FN` (reason "user", schedule event до брокера, релиз риска, cancel/tick callbacks) — зеркало `CLOSE_PENDING_SIGNAL_AS_CLOSED_FN` для pending. Pending-пинг помечен type "active". Если resting-ордер ИСПОЛНИЛСЯ — адаптер обязан подтвердить филл через `activateScheduled`/`commitActivateScheduled`, а не валить пинг (задокументировано в контракте, Broker и Action). Backtest пинг не эмитит (live-only, как и раньше).
  Изменения: `SignalPing.contract.ts` (+type, доки), `ClientStrategy.ts` (новые FN + врезка в tick), `Broker.ts` (`BrokerSignalPendingPayload.type`, подписка, доки `onOrderCheck`/`commitSignalPending`), `Action.interface.ts` + `ActionProxy.ts` + `StrategyConnectionService.ts` (доки; сам type течёт по цепочке Action без изменений сигнатур).
  Тесты: e2e «order ping fires for scheduled signal (type schedule) and cancels on failure» (throw в `callbacks.onOrderCheck` → tick #2 cancelled/user + событие на брокерском канале), «order ping carries type active for pending position».

- [x] **Номенклатура «order*» вместо «signal*» для биржевой синхронизации** (breaking renames по решению продукта, литералы wire-формата `"signal-open"`/`"signal-close"`/`"signal-ping"` НЕ менялись):
  - коллбеки: `onSignalSync` → `onOrderSync` (`IStrategyParams`, `IActionCallbacks`); `onSignalPing` → `onOrderCheck` (`IStrategyParams`, wiring в StrategyConnectionService);
  - Action-метод: `signalSync` → `orderSync` по всей цепочке (`IAction`, `ActionProxy`, `ClientAction`, `ActionConnectionService`/`ActionCoreService`, вызов из `CREATE_SYNC_FN`, discouraged-список валидатора);
  - контракты: `SignalSyncContract` → `OrderSyncContract` (+ `SignalSyncBase` → `OrderSyncBase`, `SignalOpenContract`/`SignalCloseContract` → `OrderOpenContract`/`OrderCloseContract`), `SignalPingContract` → `OrderCheckContract`; файлы `SignalSync.contract.ts` → `OrderSync.contract.ts`, `SignalPing.contract.ts` → `OrderCheck.contract.ts` (git mv);
  - модели: `SignalSyncOpenNotification`/`SignalSyncCloseNotification` → `OrderSyncOpenNotification`/`OrderSyncCloseNotification`;
  - внутренние FN ClientStrategy: `CALL_SIGNAL_SYNC_OPEN/CLOSE_FN` → `CALL_ORDER_SYNC_OPEN/CLOSE_FN`, `CALL_SIGNAL_PING_FN` → `CALL_ORDER_CHECK_FN`, `CALL_SCHEDULED_SIGNAL_PING_FN` → `CALL_SCHEDULED_ORDER_CHECK_FN`.
  Имена сабжектов (`syncSubject`/`syncPendingSubject`) и публичных слушателей (`listenSync`) не менялись. packages/ и тесты старые имена типов не использовали. Сгенерированные docs/*.md и CHANGELOG не трогались (перегенерируются при релизе).

- [x] **`OrderSyncContract.type: "schedule" | "active"` + гейт размещения resting-ордера при создании scheduled** (805 ok / 0 fail)
  В `OrderSyncBase` добавлен дискриминатор `type`: все существующие эмиссии (немедленное открытие, филл активации, все закрытия) — `"active"`; новая — `"schedule"`: `OPEN_NEW_SCHEDULED_SIGNAL_FN` теперь вызывает `CALL_ORDER_SYNC_SCHEDULE_OPEN_FN` (onOrderSync, action "signal-open", type "schedule") ДО `setScheduledSignal` — scheduled регистрируется/персистится только после подтверждения брокером размещения лимитника (тот же контракт, что у `OPEN_NEW_PENDING_SIGNAL_FN`). Отказ (false/throw): релиз риск-резервации + откат `_lastSignalTimestamp` → ретрай размещения на следующем tick (по аналогии с "active"). Backtest гейт не эмитит (short-circuit в `CREATE_SYNC_FN`). `BrokerSignalOpenPayload.type` прокинут через подписку `syncSubject`; доки `IBroker.onSignalOpenCommit`/`commitSignalOpen` описывают оба типа. Wire-литерал action не менялся.
  Тест: e2e «scheduled placement sync-reject rolls back and retries on next tick» (interval "1h": tick #1 отказ → idle, ничего не зарегистрировано; tick #2 через минуту → "scheduled"). Существующие listenSync-тесты переведены на фильтр `type === "active"`.

- [x] **Сложные интеграционные тесты на ClientStrategy** (811 ok / 0 fail) — новый `test/e2e/gauntlet.test.mjs` (5 тестов, подключён в test/index.mjs)
  1. *Полный жизненный цикл scheduled с отказом на каждом гейте* (live "1h"): placement-reject → откат → placement-accept → waiting → activation sync-reject → терминальная отмена (событие + брокер) → проверка терминальности (тот же час — getSignal заглушен) → новый час → повторный цикл до "opened" по priceOpen. Строгие последовательности tick-действий, schedule-событий и счётчиков sync по типам.
  2. *Гонка stopStrategy внутри активационного гейта*: stopStrategy вызывается ИЗ sync-слушателя активации, затем гейт отвергает → ровно ОДНО «cancelled» на обоих каналах (scheduleEvent + commit), дренаж tick #3 дубля не даёт — прямая проверка дедупа PLAN §2.
  3. *Backtest переживает risk-reject на wick-активации*: сигнал #1 отменяется (cancelled/user, без фатала «no pending signal»), сигнал #2 активируется и закрывается time_expired; строгий порядок терминальных результатов и ровно 4 вызова риск-валидации.
  4. *Отказ active order-check освобождает состояние*: closed/"closed" по listenCheck-throw, следующий tick открывает СВЕЖИЙ сигнал (риск-слот снят, whipsaw не блокирует).
  5. *Каскад risk-reject → sync-reject → успех на трёх соседних tick* внутри одного "1h"-интервала: оба отката троттла работают вместе, детерминированный id не блокируется whipsaw.

- [x] **Публичные `listenCheck`/`listenCheckOnce`** (806 ok / 0 fail) — `src/function/event.ts`, экспорт в `src/index.ts`
  Слушатели `syncPendingSubject` (`OrderCheckContract`) — пара к `listenSync`/`listenSyncOnce` (syncSubject), тот же паттерн: queued-обёртка, discouraged-предупреждения с редиректом в `Broker.useBrokerAdapter#onOrderCheck` (подавляются `warned=true`), гейт-семантика — throw закрывает позицию ("active") или отменяет scheduled ("schedule").
  Тест: e2e «listenCheck receives order pings and gates scheduled signal».

- [x] **P4 (вскрыто тестами): валидатор ActionSchema для discouraged-методов (`signalSync`/`orderCheck`) бросал generic-ошибку с противоречащей подсказкой** — `ActionSchemaService.ts`
  Dedicated-сообщение «перенеси в Broker.useBrokerAdapter» только логировалось (console.log), после чего срабатывал generic-throw с советом «переименуй в _orderCheck» — прямо противоречащим замыслу. Теперь discouraged-ветка бросает своё сообщение.

Проверено и признано корректным (без изменений): `Promise.race` с TIMEOUT_SYMBOL в GET_SIGNAL_FN, whipsaw-защита с fallback-релизом риска, TO_PUBLIC_SIGNAL, PARTIAL_*_FN (долларовый кап), TRAILING_*_FN (расчёт от оригинала, absorption), BREAKEVEN_FN, AVERAGE_BUY_FN + getEffectivePriceOpen, PROCESS_COMMIT_QUEUE_FN (at-most-once), WAIT_FOR_INIT_FN (Infinity-restore, commitQueue по id), CHECK_PENDING_SIGNAL_COMPLETION_FN (приоритет time→TP→SL), PROCESS_PENDING_SIGNAL_CANDLES_FN (VWAP-окно, frameEndTime), все deferred-дренажи tick/backtest, createSignal/createTakeProfit/createStopLoss, wick-активация в backtest vs VWAP в live (осознанное моделирование лимитника).

---

## Аудит корневого ./src, четвёртый проход (2026-07-03): исправлено

Зоны — последняя слепая зона проекта: classes/Live.ts (5.4k) и classes/Backtest.ts (5.4k) целиком, StrategyConnectionService (2.6k), Cron, Interval, State, Dump, остальные Persist-Utils блоки, assets/*.columns.ts, meta (Time/Runtime/Context), logic/public, command. Тест: +1 e2e-регрессионный. Полный набор: 796 ok / 0 fail.

- [x] **P1: копии partial-close в Backtest.ts и Live.ts не выровнены с фиксом первого прохода** — `src/classes/Backtest.ts`, `src/classes/Live.ts` (8 мест)
  Фикс «commitPartialProfitCost/commitPartialLossCost: недозакрытие» из первого прохода был применён только к канону `src/function/strategy.ts` — обе копии остались на старой математике: долларовые варианты конвертировали `dollarAmount` через **total invested** (`getPositionInvestedCost`) вместо **remaining cost basis** (`getTotalCostClosed`) → после первого partial $75 закрывали $37.50; percent-варианты слали брокеру `cost` тоже от total invested. Выровнено с каноном во всех 8 местах (по принципу «баг чинится во всех копиях»).
  Тест: e2e «Backtest.commitPartialProfitCost copy closes exact dollars after prior partial» ($300 − $150 − $75 → ровно $75).

- [x] **P2: trailing percent-варианты — брокеру уходила цена от эффективного уровня вместо оригинального** — `src/function/strategy.ts` + обе копии (6 мест)
  Первый проход перевёл на `originalPriceStopLoss ?? ...` только Cost-варианты (`*PriceToPercentShift`); в percent-вариантах информационный `newStopLossPrice`/`newTakeProfitPrice` для `Broker.commitTrailingStop/Take` считался через `*PercentShiftToPrice` от `signal.priceStopLoss`/`priceTakeProfit` — эффективного (возможно уже подтянутого) уровня, тогда как ядро применяет shift от ОРИГИНАЛЬНОГО. После первого trailing брокер-адаптер получал неверную цену для обновления биржевого ордера (live-only: в бектесте commit скипается). Исправлено во всех трёх копиях.

- [x] **P2: `IntervalFnInstance.run` — async-функция, вернувшая null, блокировалась на весь интервал** — `src/classes/Interval.ts`
  Контракт (докстринг, sync-ветка, IntervalFileInstance): «null → отсчёт не стартует, следующий вызов ретраит». Для async-fn state ставился при вызове (Promise всегда non-null) и снимался только при reject — резолв в null оставлял интервал «выстрелившим». Фикс: `.then` снимает state при резолве в null (с guard'ом на актуальность интервала, чтобы не стереть state более нового boundary); оптимистичная установка сохранена — конкурентные вызовы в полёте по-прежнему не дублируют fire.

- [x] **P3: `removeMeasureData` / `removeIntervalData` — throw на несуществующем ключе** — `src/classes/Persist.ts`
  То же семейство, что `removeMemoryData` из третьего прохода: `readValue` бросает «Entity not found», код ждал null. Добавлен `hasValue`-гард в обе копии (идемпотентный no-op).

- [x] **P1: stopStrategy — scheduled-сигнал через cancel-пайплайн (брокер + risk-релиз)** — `src/client/ClientStrategy.ts`
  Закрывает «известное исключение» первого прохода. `stopStrategy` зануляла `_scheduledSignal` мимо пайплайна отмены: брокер не уведомлялся — **реальный resting order оставался на бирже** (и мог исполниться без мониторинга), risk-резервация утекала. Вдобавок стирались отложенные `_cancelledSignal`/`_closedSignal` (терялся user-cancel/close, выданный перед стопом) и `_activatedSignal` (ордер за ним тоже осиротевал). Фикс:
  1. scheduled (или отложенная активация) конвертируется в `_cancelledSignal` (`cancelNote: "stop_strategy"`) — следующий tick дренирует штатно: commit `cancel-scheduled` + `onScheduleEvent("cancelled","user")` → `scheduleEventSubject` → `Broker.commitScheduleCancelled` (адаптер снимает ордер) + `CALL_RISK_REMOVE_SIGNAL_FN`; отложенная отмена персистится (крэш до следующего тика — restore и дренаж после рестарта);
  2. отложенные `_cancelledSignal`/`_closedSignal` больше не стираются (та же логика, что у сохраняемых `_takeProfitSignal`/`_stopLossSignal`);
  3. stopped-ветки активации (live tick + backtest) теперь эмитят cancel-событие вместо тихого дропа (зеркально risk-reject веткам).
  Live-цикл после стопа делает как минимум ещё один tick (результат «cancelled» ≠ idle), так что дренаж успевает до выхода из цикла. В backtest цикл рвётся до следующего tick — отмена может не заэмититься, но там нет реального ордера, а risk-map пер-ран.
  Тест: e2e «stopStrategy routes scheduled signal through cancel pipeline» (tick #1 = scheduled → stop → tick #2 = cancelled/user + событие на брокерском канале). Полный набор: 797 ok / 0 fail.

Проверено и признано корректным (без изменений): Backtest.ts/Live.ts остальное (task/run/background/stop, overlap-ladder математика, commitBreakeven/commitAverageBuy/commitCreate*, Cost-варианты trailing, getData/getReport), StrategyConnectionService целиком (CREATE_SYNC_FN/SYNC_PENDING_FN gate-семантика, фабрики callbacks, GET_RISK_FN merge, memoize+clear/dispose), Cron.ts целиком (watermark со строгим `>`, generation-изоляция, rollback при fail, watchdog), State.ts (singleshot + look-ahead-гарды), Dump.ts (структура адаптеров), остальные Persist-Utils (Signal/Risk/Schedule/Strategy/Partial/Breakeven/Storage/Notification/Log/Recent/State — hasValue-гарды на месте), assets/*.columns.ts (pnl-колонки с честными null/undefined-гардами; truthiness на ценах допустима — 0-цена невалидна по validateCandles), RuntimeMetaService (_getRange/_getInfo мемоизированы по схеме, не по сгенерированным таймфреймам), TimeMetaService (зеркало PriceMetaService), logic/public и command (тонкие обёртки).

---

## Аудит корневого ./src, третий проход (2026-07-03): исправлено

Зоны: StrategyCoreService, classes/Broker (2.8k), Recent, Session, Storage, Sync, function/* (event, dump, signal, list и мелкие), ActionConnectionService/ActionCoreService/ClientAction, PersistSession-слой. Тесты: +1 регрессионный в `test/spec/audit.test.mjs`. Полный набор: 795 ok / 0 fail.

- [x] **P1: персистентная сессия текла между символами** — `src/classes/Session.ts` + `src/classes/Persist.ts`
  `SessionPersistInstance` скоупится по (symbol, strategy, exchange, frame, backtest), но дисковая запись ключевалась только `./dump/session/<strategy>/<exchange>/<frame>/<frame>.json` — ни символа, ни backtest-флага, а `data.id` при restore не проверялся. Два live-символа одной стратегии клобберили одну запись, после рестарта один символ восстанавливал session-состояние другого. Фикс: (1) entity id = `<symbol>_<backtest|live>` — per-symbol файлы; (2) `PersistSessionInstance`/`TPersistSessionInstanceCtor`/`PersistSessionUtils` получили обязательные параметры `symbol`, `backtest` (⚠️ breaking change для кастомных session-адаптеров); (3) belt-and-braces: restore валидирует `data.id` против ожидаемого ключа — запись чужого контекста игнорируется с warn (защищает и кастомные адаптеры, которые всё ещё ключуются без символа).
  Старые персистентные сессии (ключ = frameName) после апгрейда игнорируются — одноразовый сброс session-состояния.
  Тест: «session persist: symbols do not share persisted session state» (JSON-адаптер включается локально в скоупе теста — глобальный test-setup ставит dummy).
  Хвост закрыт: `packages/mongo` переведён на новый ключ (PersistSessionInstance, SessionDbService, SessionCacheService, Session.schema) — `symbol`/`backtest` добавлены в ctor, фильтры upsert/findByContext, redis-ключ кэша и уникальный индекс схемы.
  ⚠️ Миграция mongo: на существующих базах вручную удалить легаси-индекс `(strategyName, exchangeName, frameName)` у `session-items`, иначе upsert второго символа того же контекста упадёт с E11000; старые записи без `symbol`/`backtest` не находятся новым фильтром (одноразовый сброс сессий).

- [x] **P2: BrokerProxy бросал на нереализованных commit-методах** — `src/classes/Broker.ts`
  `TBrokerCtor` документирует «все методы IBroker опциональны», но 8 commit-методов (`onSignalOpenCommit`, `onSignalCloseCommit`, partial/trailing/breakeven/averageBuy) бросали «not implemented». Из-за gate-семантики throw трактуется как «биржа не исполнила»: адаптер только с информационными хуками (нотификации) при `enable()` молча блокировал ВСЕ открытия/закрытия позиций с вечным retry. Фикс: skip с warn-логом (= «allow»), как у ping-хендлеров; докстринги выровнены.

- [x] **P2: Storage._enforceLimit выселял по insertion-order вместо priority** — `src/classes/Storage.ts` (4 копии: Persist/Memory × Backtest/Live)
  JS Map сохраняет позицию ключа при обновлении значения: активный сигнал (самая свежая priority, но старая позиция вставки) вылетал из списка первым при переполнении CC_MAX_SIGNALS. Фикс: эвикция минимальной `priority`.

- [x] **P3: докстринг StorageBacktestAdapter** — заявлял Persist по умолчанию, фабрика создаёт Memory. Приведён к коду.

- [x] **P3: копипаст-метки логов Recent** — `getMinutesSinceLatestSignalCreated` в обоих адаптерах логировался как `getLatestSignal`; добавлены отдельные метки.

- [x] **P3: докстринги getSignalState/setSignalState** — обещали «warning + initialValue» при отсутствии сигнала, код бросает. Приведены к коду.

Проверено и признано корректным (без изменений): StrategyCoreService (чистая делегация validate+proxy, ~50 методов), Broker payload-типы и enable/disable-проводка, BrokerBase, Recent (look-ahead-гарды, минутная математика), Sync (фасад), Session Local/Dummy-варианты, Storage stale-гарды (`updatedAt`), function/event.ts (60+ listen*-обёрток, listenSync-варнинг — дизайн), dump.ts, signal.ts, list.ts, ClientAction (trycatch-обвязка callbacks, sync/orderCheck без trycatch — осознанно), ActionConnectionService/ActionCoreService (memoize-ключи полные; ClientAction без символа в ключе — дизайн, события несут symbol), мелкие function/* (get, state, meta, setup, context, session, init, shutdown, control, timeframe, validate, override, add, memory, exchange).

Не покрыто третьим проходом: lib/services/schema/* и validation/* (декларативные), lib/services/helpers/NotificationHelperService, command/* (тонкие фасады над logic-сервисами — беглый осмотр без полного чтения), classes/{Interval,Cron,Lock,Lookup,Writer,Dump,Report,Markdown,Heat,Performance,Constant,System,Position,Partial,Breakeven,Schedule,HighestProfit,MaxDrawdown,ActionProxy,ActionBase,Reflect,State,Log,Lookup}.

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

---

## Аудит packages/pinets (исправлено)

- [x] **P1: PineJobService требовал класс Indicator даже без inputs** — `indicatorConnectionService.getInstance` вызывался безусловно, а использовался только при непустых `inputs`. В usePine-only окружениях (peer `pinets` не установлен, `useIndicator` не вызван) падал каждый `run()`/`getSignal()`/`markdown()`. Фикс: Indicator создаётся только в ветке с inputs. Проверено: run без inputs проходит с бросающим Indicator-ctor, с inputs — конструирует.

- [x] **P1: extract() молча подставлял 0 вместо отсутствующих плотов** — опечатка в имени плота давала либо «стратегия молча никогда не торгует» (position=0 → null DTO без диагностики), либо DTO с TP/SL=0, который отбивался валидацией backtest-kit с маскирующей ошибкой «must be positive, got 0». Фикс: `GET_VALUE_FN` бросает понятную ошибку (имя плота + список доступных); для легитимно опциональных плотов добавлен `PlotExtractConfig.defaultValue` (extract и extractRows). SIGNAL_SCHEMA: `Close`/`EstimatedTime` помечены defaultValue (поведение сохранено: нет Close → DTO без priceOpen; нет EstimatedTime → 240), `Signal`/`TakeProfit`/`StopLoss` — обязательные, отсутствие бросает. ⚠️ поведенческое изменение: код, полагавшийся на тихий 0 для обязательных плотов, теперь получает ошибку.

- [x] **P2: ~120 строк copy-paste** между run.function.ts и markdown.function.ts (+третья копия GET_SOURCE_FN в strategy.function.ts) — вынесены в `helpers/inference.ts` (`getSourceCode`, `runInference` с VALIDATE_NO_TRADING_FN).

- [x] **P2: toSignalDto** — убран мёртвый импорт randomString; `if (priceOpen)` заменён на проверку конечного положительного числа (Infinity/NaN больше не попадают в DTO).

- [x] **P3: extractRows timestamp** брался только из плота первого ключа маппинга — теперь из первого плота, имеющего точку на данном индексе.

- [x] **P3: PineMarkdownService.getData** — ключ маппинга `"time"` конфликтовал со служебным полем времени строки (колонка показывала timestamp вместо значения плота) — теперь зарезервирован, бросает понятную ошибку.

- [x] **P3: getSymbolInfo эвристика** — пары не на USDT/BUSD/USD (ETHBTC) получали base=весь символ, currency="USDT". Список квот расширен (USDT/USDC/BUSD/TUSD/FDUSD/USD/BTC/ETH/BNB/EUR): ETHBTC → ETH/BTC.

- [x] **P3: CandleProviderService** — неизвестный таймфрейм слепо кастовался в CandleInterval; теперь валидация против INTERVAL_MINUTES (экспортирован из AxisProviderService) с перечислением допустимых значений.

- [x] **P3: dual-package hazard Code/File** — брендинг `Symbol("...")` заменён на `Symbol.for("backtest-kit.pinets.*")`: экземпляры из CJS-копии проходят isCode/isFile ESM-копии и наоборот (проверено на build/index.mjs + build/index.cjs в одном процессе).

Проверено и признано корректным (без изменений): PineCacheService — memoize functools-kit сбрасывает кэш при reject (залипания ошибок чтения нет, проверено); отсутствие closeTime в провайдерах — PineTS достраивает openTime+barDuration (проверено реальным прогоном PineTS); AxisProviderService — все 5 комбинаций sDate/eDate/limit и look-ahead-защита корректны; look-ahead clamp eDate→context.when в CandleProviderService корректен.

---

## Аудит packages/ollama/src (исправлено)

- [x] **P0: все 12 обёрток signal.function.ts теряли аргументы** — `async (args: Parameters<T>)` без rest-оператора: `wrapped("BTCUSDT", 42)` спредил строку в символы → функция получала `("B","T")`. Фикс: `(...args: Parameters<T>)` во всех обёртках. Проверено на built: аргументы доходят без искажений.

- [x] **P0: apiKey утекал в outline-результаты и дампы** — 7 tool-based провайдеров записывали `_context = contextService.context` (с ключом) в JSON результата, который дампится в ./dump markdown и уходит потребителям. Фикс: `_context = { inference, model }` (без apiKey) во всех семи. В бандле не осталось ни одной сырой инъекции. GrokProvider дополнительно слал весь context (с ключом) в теле HTTP-запроса — убрано.

- [x] **P0: singleshot замораживал первый apiKey навсегда** — все `config/*.ts` (ollama, claude, openai, zai, cohere, deepseek, mistral, perplexity, grok, groq, ollama.rotate): клиент кэшировался с ключом первого контекста; смена ключа/режима между контекстами молча игнорировалась. Фикс: `memoize` по apiKey (по списку ключей для ротации), OllamaWrapper принимает ключи параметром конструктора. HfProvider уже создавал клиентов per-call — не тронут.

- [x] **P1: Grok outline-запрос без `model`** — единственный из 12 провайдеров не передавал модель (вместо неё в body лежал мусорный `context`). Добавлен `model`, `context` удалён.

- [x] **P1: ClientOptimizer собирал стратегии вопреки контракту** — push был внутри цикла по источникам: N×M стратегий с кумулятивными промптами и ОБЩИМ мутируемым messageList (messages ранних стратегий менялись задним числом); `"name" in source` для функций давало имя JS-функции. Фикс: одна стратегия на диапазон (getPrompt получает полную историю, как в доке IOptimizerSchema.getPrompt), `messages: [...messageList]` снапшот, имя = range.note || join имён источников. Проверено: 2 диапазона × 2 источника → 2 стратегии, getPrompt видит [4,4] сообщений, снапшоты изолированы, имена "bull" / "news+unknown". Док IOptimizerStrategy.name обновлён. ⚠️ поведенческое изменение: было ranges×sources стратегий, стало ranges.

- [x] **P1: сгенерированный код возвращал `position: "wait"` как сигнал** — каждый wait отбивался валидацией backtest-kit с ошибкой. В getStrategyTemplate добавлен `if (result.position === "wait") return null;` (после dumpJson — дамп сохраняется).

- [x] **P1: toPlainString терял маркеры списков** — тот же дефект sanitize-html, что чинили в cli: маркеры теперь вставляются текстом до санитизации (`• ` для ul, `1. 2. …` для ol). Проверено: "• Item 1\n• Item 2\n1. First\n2. Second".

- [x] **P1: фантомные зависимости** — `lodash-es@^4.17.21` добавлен в dependencies (8 файлов импортируют), `@langchain/openai@^0.4.9` в peerDependencies (используется HfProvider). Из ClaudeProvider удалены мёртвые импорты (@langchain/core messages, ChatOpenAI, IToolCall, errorData, getErrorMessage, randomString, fetchApi).

- [x] **P2: PromptCacheService** — memoize ключевался по объекту Module (кэш никогда не срабатывал между fromPath-вызовами) → ключ по join(baseDir, path); в clear(module) отсутствовал return → точечная очистка стирала весь кэш.

- [x] **P3: мелочи** — сообщение таймаута RunnerStreamCompletion (было RunnerCompletion); Claude stream-debug пишет в debug_claude_provider_stream.txt (было gpt5); `content!` → `content ?? ""` во всех провайдерах (tool-calls-only ответы давали null-content); `dump()` принимает абсолютные пути (isAbsolute); Prompt/Module брендинг через Symbol.for (dual-package hazard, проверено mjs↔cjs); JSDoc glm4 перенесён к glm4.

Не тронуто осознанно: INFERENCE_TIMEOUT 35s (дизайн-параметр); контекст в logger-вызовах (opt-in логгер пользователя).

---

## Аудит packages/mongo/src (исправлено по решениям)

- [x] **P0: eager-подключение на import → lazy через singleshot waitForInit.** di-kit `init()` вызывал `protected init()` Mongo/Redis сервисов при импорте пакета: соединения открывались с env/localhost-конфигом до `setup(config)`, и пользовательский конфиг игнорировался (singleshot-клиенты уже созданы). Фикс: `protected init` удалён у обоих сервисов; листнеры соединения Mongo (включая throw в глобальный скоуп при ошибке — оставлен по решению) перенесены в `waitForInit` через singleshot `LISTEN_EVENTS_FN` (без дублей при retry после таймаута). Проверено на built: импорт без setup — 0 попыток соединения за 2с; `setConfig({CC_REDIS_PORT: 51234})` после импорта — redis реально набирает 51234.

- [x] **P0: BaseCRUD.findAll сортировал по несуществующему полю `date`** — ни одна из 16 схем его не имеет (все используют createDate/updatedDate через timestamps rename). Natural order + limit 1000 давал произвольное подмножество при >1000 документов. Фикс: `.sort({ updatedDate: -1 })` — записи, которые ТЕКУЩИЙ бектест/live активно пишет (upsert обновляет updatedDate), гарантированно внутри окна лимита; вытесняются только записи завершённых прогонов. (createDate не подходит: давно созданная, но активно обновляемая запись текущего прогона выпадала бы из окна.)

- [x] **P1: redis ping-интервал** — стал lazy автоматически (живёт внутри `getRedis`, который теперь вызывается только при первом waitForInit). Отсутствие catch у ping оставлено по решению («исключения в глобальный скоуп — нормально»).

Оставлено как есть по решениям: throw внутри mongoose error-хендлера (fail-fast в глобальный скоуп); write-адаптеры Storage/Log/Notification не удаляют старые записи («хочу держать всегда, это информация» — с фиксом сортировки limit-окно стало детерминированным: новейшие 1000); глобальный monkey-patch `mongoose.Schema.Types.String.checkRequired` (осознанный дизайн).

Не подтвердилось при аудите: singleshot не кэширует rejected promise (utils/waitForInit не «залипает»); несортированность readStorageData сама по себе безвредна (backtest-kit сортирует по priority и применяет CAP на чтении); Log/Notification `.reverse()` корректен; уникальные индексы есть во всех 16 схемах.

---

## Аудит packages/graph/src (исправлено)

- [x] **P1: resolve вычислял общие зависимости многократно** — в «ромбе» общий узел резолвился по разу на потребителя: двойной fetch (два запроса к API) и потенциально разные значения внутри одного вычисления. Фикс: мемоизация `Map<node, Promise<Value>>` на проход — каждый узел вычисляется ровно один раз. Проверено: ромб из compute-узлов → общий узел вызван 1 раз, результат корректен (запуск через реальные Execution/Method-контексты backtest-kit).

- [x] **P1: resolve без защиты от циклов** — бесконечная рекурсия на цикличном графе (собранном вручную/из deserialize). Фикс: предварительный DFS с gray/black-раскраской (линейный, ромбы не обходятся повторно) → понятная ошибка «cycle detected». Проверено.

- [x] **P1: round-trip ломал OutputNode без зависимостей** — `nodeIds: []` не проходил `?.length`-проверку в deserialize → `nodes: undefined` → TypeError в resolve. Фикс: `if (flatNode.nodeIds)` (включая пустой массив) + `target.nodes ?? []` в resolve. Проверено: serialize→deserialize→resolve для `outputNode(() => 42)` возвращает 42.

- [x] **P1: deserialize молча выбрасывал неизвестные nodeIds** — контракт compute(values) позиционный, тихое выпадение сдвигало чужие значения. Фикс: throw с id узла и битой ссылкой. Проверено.

- [x] **P2: сериализация в БД была нереализуема** — id генерировались заново при каждом serialize, стабильного ключа для повторной привязки fetch/compute после JSON round-trip не существовало. Фикс (финальный дизайн): id — обязательное поле SourceNode/OutputNode, хелперы sourceNode/outputNode проставляют его при создании; введён внутренний тип INodeInternal (id гарантирован) — его возвращает deserialize; рукописным INode id доштамповывается на входе serialize (sticky — мутация на объекте, повторный serialize стабилен); дубликаты id — ошибка. Для переживания перезапуска процесса пользователь перезаписывает id своим стабильным значением (задокументировано). Проверено: штамповка при создании, стабильность между вызовами serialize, sticky для рукописных узлов, round-trip resolve, duplicate throw.

- [x] **P2: getAveragePrice вызывался на каждый SourceNode** — N источников = N запросов цены и рассинхрон значений в одном проходе. Фикс: одна lazy-цена на проход resolve.

- [x] **P3: NodeType не экспортировался из index** — добавлен экспорт. Неиспользуемые dependencies (di-kit, di-scoped, get-moment-stamp) удалены из package.json (используется только functools-kit).

Проверено и признано корректным: deepFlat (дедупликация ромба, устойчивость к циклам, топологический порядок), типовыведение InferValues/InferNodeValue, fail-fast проверки контекстов в resolve.

---

## Аудит packages/front/src (исправлено)

- [x] **P1: symlink-escape в ExplorerViewService.getNode** — buildTree резолвил симлинки через realpath+visited, а getNode нет: guard проверял только resolve-путь, readFile следовал симлинку наружу dump (симлинк внутри dump на /etc/... проходил проверку и читался). Не удалённый вектор (создать симлинк по HTTP нельзя), но защита была асимметричной. Фикс: realpath(absPath) + повторная проверка префикса против realpath(dir). Проверено на built: обычный файл и внутренний симлинк читаются, симлинк наружу и `../`-traversal блокируются; корректно при cwd за симлинком (/tmp→/private/tmp).

- [x] **P2: omit не рекурсировал в массивы** — isObject([])===false, поэтому `omit(result, "data")` в логировании роутов не вырезал data из объектов внутри массивов: тяжёлые payload'ы утекали бы в лог. На текущих вызовах data верхнеуровневый (латентно), но хрупко. Фикс: хелпер omitValue — рекурсия в объекты и массивы любой вложенности. Проверено: data вырезается в массиве, во вложенном объекте внутри массива и во вложенном массиве; скаляры не тронуты.

- [x] **P2: serve не восстанавливался после EADDRINUSE** — singleshot serveInternal «выстреливал» до listening; при занятом порте error-callback вызывался, но повторный serve() возвращал мёртвый сервер (clear() был только в teardown, который никто не получал). Фикс: `serveInternal.clear()` в error-листенере при `!server.listening` (ошибки уже слушающего сервера singleshot не сбрасывают). Проверено на built: attempt1 → EADDRINUSE, освобождение порта, attempt2 → listening.

Осознанный дизайн (по решению, не флагуется): REPL `/api/v1/repl/eval` («все кнопки не предусмотришь») и сопутствующий открытый CORS `*`; getSetupData отдаёт весь getConfig() в браузер (self-admin).

Не исправлялось (не баги): StatusViewService — два идентичных ~45-строчных блока маппинга symbols (backtest/live) — осознанная копипаста (SRP), правки применять в оба блока; icon-кэши без eviction (ограничены числом файлов иконок), негативного кэша для 404-иконок нет (каждый промах — existsSync+readFile). Проверено и корректно: traversal-guard getNode, единый try/catch-конверт роутов, SymbolConnectionService (дедуп+стабильная сортировка), omit не мутирует вход.

---

## Аудит packages/front/modules/frontend/src (исправлено)

- [x] **P1: инвертированный useOnce в ControlView (ручная торговля)** — `useOnce(subject.subscribe(handler))`: subscribe выполнялся в теле рендера (новая подписка на каждый рендер), а useOnce на маунте вызывал unsubscribe только первой. Подписки на модульные эмиттеры копились и переживали unmount: «Open Position» открывала модалку по числу накопленных подписок, висели обработчики умерших инстансов со старым payload (риск модалки с контекстом прежнего символа). Фикс: `useOnce(() => subj.subscribe(...))` — 5 мест, единственный файл с этим паттерном (проверено grep'ом).

- [x] **P2: ttl из react-declarative кэширует rejected-промисы** — проверено по реализации в бандле (memoize {value, ttl} без инвалидации при reject): разовый сетевой сбой getAveragePrice залипал в модалке Open Position/Average Buy на 2.5 минуты без ретрая; то же во всех ~17 fetchData view-хуков (45с) и explorer/status кэшах. Фикс: обёртка src/utils/ttl.ts — при reject сбрасывает ключ (clear(key) / clear() без ключа — семантика memoize.clear проверена по бандлу), rejected-промис доходит до текущих ожидающих. Импорты переключены скриптом в 33 файлах; висячий неиспользуемый импорт в OperationLabel удалён.

- [x] **P2: downloadHtml не генерировал PDF при наличии Sanitizer API** — ранний `return element.innerHTML` вместо продолжения к html2pdf (ветка сегодня мёртвая — Sanitizer нигде не включён по умолчанию — но логика перепутана). Фикс: санитизация → общий стайлинг → PDF.

- [x] **P2: фантомная зависимость markdown-it** — импортировался в toPlainString, но отсутствовал в package.json/node_modules фронтенда (резолвился из родительского packages/front). Фикс: `npm install markdown-it@14.1.0` (версия как у родителя).

- [x] **P2: ExplorerViewService.clear() не чистил getFolderMap** — после clear карта отдавала устаревшие данные до 45с. Фикс: добавлен getFolderMap.clear().

- [x] **P3: маркеры списков терялись в toPlainString** — transformTags не вставляет текст (`li: () => "• "` молча терял маркер; тот же паттерн, что чинили в cli/signals/ollama). Фикс: инъекция "• " в HTML до санитизации. Проверено: "- first" → "• first".

- [x] **P3: trailing-take StockChart разошёлся с 14 копиями** — сырое `!==` вместо toFixed(6)-сравнения → фантомная пунктирная «Original SL» из float-шума. Выровнен.

- [x] **P3: ноль-как-falsy** — StatusInfo fmt/fmtMin («—» для PNL 0.00), 11 мест `!!item.pnlPercentage ? ... : "N/A"` (NotificationView + 2 копии NotificationCard), MarkdownHelperService `if (value)` (0/false выпадали из PDF/MD-отчётов), str() фильтровал числовой 0. Везде заменено на null-проверки с сохранением отбрасывания false/null/"" (паттерн `cond && "text"`).

- [x] **P3: wordForm неправильно склонял 111, 211…** — проверка 11..19 без %100. Фикс: %100 ∈ 11..14 → many; проверено на 0..211 (121 → «сигнал», 111 → «сигналов»).

- [x] **P3: CC_ENABLE_MOCK/CC_FORCE_BROWSER_HISTORY** — `!!process.env.X`: строка "0"/"false" включала флаг. Фикс: parseBool с "0"/"false"/"off"/"no".

- [x] **P3: мёртвая ветка navigator.copyToClipboard** (API не существует) удалена; **вечный while(!window.Translate)** заменён ограниченным ожиданием (20×500мс, затем рендер с console.error — t() умеет работать без Translate); **VertLine** больше не лезет в приватный _container lightweight-charts и не хватает первый график на странице через querySelector — контейнер передаётся явно (исправлено скриптом во всех 14 копиях, включая SimpleStockChart).

Сборка: vite build прошёл (23.9s), маркеры фиксов найдены в бандле; фронт раздаётся напрямую из modules/frontend/build (getPublicPath), копирование не требуется. Юнит-проверки: wordForm (0..211), str (0 сохраняется), toPlainString (буллеты), семантика memoize.clear.

Проверено и корректно (не трогалось): проводка 20 subject→hook в LayoutModalProvider; диспетчеризация типов в NotificationView; type-guard'ы 20 view-хуков; SubmitView торговых модалок; ревок blob-URL через route-listen; отсутствие таймер-утечек.

### Дополнительный проход (виджеты, DashboardPage/api.ts)

- [x] **P2: PartialWidget завышал долларовый PnL частичек** — `pnlDollar = pnlPct% × costBasisAtClose` (весь basis) вместо pnlPct% × проданной части (closedDollar): частичка на 25% завышала PnL в тултипе и totalPnlDollar в 4 раза. Сверено с toProfitLossDto бэкенда.

- [x] **P2: PartialWidget считал effectiveEntry не по алгоритму бэкенда** — Σcost/Σcoins по всем входам вместо итеративного computeEffectivePriceAtPartial (остаточный basis предыдущей частички по её effPrice + DCA-входы между частичками). Портирован алгоритм целиком; численно сверен с бэкенд-реализацией через tsx на сценарии 3 входа/3 частички с DCA между ними — MATCH по всем индексам.

- [x] **P3: SpeedDonutWidget красил значение ниже шкалы цветом верхней зоны** — fallback выбирал чанк с max minValue. Теперь: выше максимума → верхняя зона, ниже минимума → нижняя; пустой список зон → нейтральный #ccc (раньше reduce без initial бросал исключение).

Проверено и чисто: **DashboardPage/api.ts** (по запросу) — updatedAt = tick.createdAt = время свечи в бектесте (Storage.ts:220,249), т.е. дневные корзины и окна выручки корректно работают в симулированном времени; несортированный dailyTrades сортируется потребителем (ChartWidget); clearSignalCache() чистит обе моды (семантика memoize.clear проверена); DST-сдвиг окон на ±1ч неактуален для UTC/RU. Также чисто: AveragingWidget, ListView, AppHeader, IconPhoto, useIndicatorStream, все 52 useOnce (подписки только через обёртку, cleanup при unmount подтверждён по реализации в бандле).

Замечание: IDE-ошибка TS2739 (onPointerEnterCapture/placeholder на PaperView) — преждесуществующее несоответствие @types/react и react-declarative по всему проекту, к правкам отношения не имеет (проект не типчекается, vite+swc).
