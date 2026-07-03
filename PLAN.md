# PLAN — исправление находок аудита ClientStrategy.ts (2026-07-03)

По итогам полного чтения `src/client/ClientStrategy.ts` (9030 строк, пятый проход). Ядро state-машины в порядке — план закрывает одно семейство багов (scheduled умирает молча на activation-путях) и две мелочи. Всё, что проверено и признано корректным, **не трогаем** (список внизу).

---

## 1. P2 — все терминальные дропы scheduled эмитят «commit + scheduleEvent» (основная работа)

**Проблема.** Канал брокера — `scheduleEventSubject` → `Broker.commitScheduleCancelled` → адаптер снимает реальный resting order. На price-активации сигнал дропается навсегда (`setScheduledSignal(null)` + релиз риска), но событие либо не эмитится вовсе, либо эмитится только commit (мимо брокера). Итог в live: ордер осиротевает на бирже; статистика отмен (ScheduleMarkdownService) не видит событие и в backtest.

**Эталон** — risk-reject ветка user-активации (`tick()._activatedSignal`, ~строка 6378): пара `CALL_SCHEDULE_EVENT_FN(self, "cancelled", signal, price, ts, "user")` + `CALL_COMMIT_FN({ action: "cancel-scheduled", ... })`. Выровнять на неё все шесть недостающих мест:

| # | Функция | Ветка | Сейчас | Донор паттерна |
|---|---------|-------|--------|----------------|
| 1 | `ACTIVATE_SCHEDULED_SIGNAL_FN` (live, ~1860) | stopped | ничего | risk-reject из tick (~6378) |
| 2 | `ACTIVATE_SCHEDULED_SIGNAL_FN` (live, ~1903) | risk-reject | ничего | там же |
| 3 | `ACTIVATE_SCHEDULED_SIGNAL_FN` (live, ~1940) | sync-reject | только commit | добавить `CALL_SCHEDULE_EVENT_FN` |
| 4 | `ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN` (~3780) | stopped | ничего | backtest risk-reject user-активации (~4394) |
| 5 | `ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN` (~3824) | risk-reject | ничего | там же |
| 6 | `ACTIVATE_SCHEDULED_SIGNAL_IN_BACKTEST_FN` (~3866) | sync-reject | только commit | добавить `CALL_SCHEDULE_EVENT_FN` |

Плюс два выравнивания sync-reject в **user**-активации (commit есть, scheduleEvent нет):

| # | Место | Правка |
|---|-------|--------|
| 7 | `tick()._activatedSignal` sync-reject (~6432) | добавить `CALL_SCHEDULE_EVENT_FN(..., "cancelled", ..., "user")` перед commit |
| 8 | `PROCESS_SCHEDULED_SIGNAL_CANDLES_FN` user sync-reject (~4462) | то же |

**Детали реализации:**
- Reason везде `"user"` — расширение `StrategyCancelReason` новыми значениями (`"risk_reject"`, `"stopped"`) не делаем: breaking change для консьюмеров enum'а без необходимости; различение — через `note` commit-события, как сделано в существующих ветках.
- Цена для события: в live-ACTIVATE — `scheduled.priceOpen` (как в существующем sync-reject commit), в backtest — `averagePrice` текущей свечи (как в донорах).
- Порядок внутри ветки сохранить как в донорах: `setScheduledSignal(null)` → `CALL_RISK_REMOVE_SIGNAL_FN` → эмиссии. Эмиссии идут ПОСЛЕ релиза риска и синхронно внутри ветки — это одновременно закрывает пункт 2 (см. ниже).
- Payload commit-события — копия формы донора (`action: "cancel-scheduled"`, publicSignal через `TO_PUBLIC_SIGNAL("scheduled", ...)`, `note: activateNote ?? note` для activation-путей / `scheduled.note` для price-путей).

## 2. P2 — гонка: `setScheduledSignal(null)` стирает `_cancelledSignal` от конкурентного stopStrategy

**Проблема.** `setScheduledSignal` при любом вызове зануляет `_cancelledSignal`/`_activatedSignal` (защита инварианта — само по себе правильно). Окно: tick держит ссылку на scheduled, на await-точке прилетает `stopStrategy` (конвертирует scheduled → `_cancelledSignal`), tick доходит до stopped/risk/sync-ветки ACTIVATE → `setScheduledSignal(null)` стирает отложенную отмену → брокер не уведомлён.

**Решение — не менять `setScheduledSignal`** (инвариант-очистка нужна остальным вызовам), а полагаться на пункт 1: после него каждая из этих веток эмитит cancel-событие **синхронно, сама**, до/независимо от затирания `_cancelledSignal`. Событие доходит до брокера в любом исходе гонки; возможный дубль эмиссии (ветка + дренаж, если отмена уцелела) исключён именно тем, что `setScheduledSignal(null)` в ветке затирает `_cancelledSignal` — то, что было багом, становится дедупликацией. Отдельного кода не требуется — только комментарий в ветках, фиксирующий эту связку.

## 3. P4 — доки (без изменения поведения)

- `averageBuy` докстринг (~8930): «simple arithmetic mean» → «cost-weighted harmonic mean» (фактическая формула `getEffectivePriceOpen`: Σcost / Σ(cost/price), с реплеем partial-закрытий).
- Комментарии «retry on next tick» у sync-reject открытия (`OPEN_NEW_PENDING_SIGNAL_FN`, `CALL_SIGNAL_SYNC_OPEN_FN` докстринг): дописать оговорку «retry произойдёт на следующей границе interval стратегии — `_lastSignalTimestamp` в GET_SIGNAL_FN уже потреблён» (см. пункт 5 — поведение не меняем без решения).
- `WAIT_FOR_INIT_FN`: restore `strategyData` — добавить комментарий, почему нет context-match сверки (дефолтный адаптер ключуется тем же triple; для кастомных адаптеров сверка невозможна — в снапшоте нет полей контекста). Код не трогаем.

## 4. Регрессионные тесты (test/e2e/audit.test.mjs)

1. **Price-активация × risk-reject → cancelled-событие**: стратегия со scheduled (priceOpen ниже рынка), риск-схема с `checkSignalAndReserve → false` при активации; свечи доводят цену до priceOpen. Ожидание: `listenScheduleEvent` получает `action: "cancelled"`, backtest-результат — cancelled, риск-мапа пуста. Прогнать backtest-путь (site 5); live-путь (site 2) — через `lib.strategyCoreService.tick` в `MethodContextService.runInContext` (паттерн теста stopStrategy).
2. **Sync-reject активации → scheduleEvent**: `onSignalSync` action "signal-open" возвращает false; ожидание — «cancelled» на `scheduleEventSubject` (site 3/6).
3. Существующий тест «stopStrategy routes scheduled signal through cancel pipeline» остаётся зелёным (регрессия пункта 2).

## 5. Требует решения продукта — в этот заход НЕ делаем

- **Retry-семантика sync-отказа открытия**: сейчас отклонённый брокером вход ретраится на следующей границе interval (для "1h" — через час), комментарии обещают next tick. Варианты: (а) откатывать `_lastSignalTimestamp` при sync/риск-отказе → честный next-tick retry (поведенческое изменение: больше запросов к getSignal-пайплайну после отказов); (б) оставить как есть, привести комментарии (минимум — уже в пункте 3). До решения — только (б).
- **Risk-reject на price-активации при уже исполненном лимитнике**: если реальный ордер успел исполниться в момент касания priceOpen, cancel-события недостаточно (на бирже уже позиция). Это фундаментальное свойство модели «framework-risk поверх биржевых ордеров», решается на стороне адаптера через `onOrderCheck`/`onSignalActivePing` — вне скоупа.

## Не трогаем (проверено, корректно)

`Promise.race` с TIMEOUT_SYMBOL в GET_SIGNAL_FN (гонка безопасна, проигравший промис не даёт unhandled rejection); whipsaw-защита и релиз риск-резервации в trycatch-fallback; TO_PUBLIC_SIGNAL; PARTIAL_*_FN (долларовый кап); TRAILING_*_FN (расчёт от оригинала, absorption); BREAKEVEN_FN (интрузионные гарды, апгрейд негативного trailing); AVERAGE_BUY_FN и getEffectivePriceOpen (взвешенный гармонический, partial-реплей); PROCESS_COMMIT_QUEUE_FN (at-most-once, персист до дренажа); WAIT_FOR_INIT_FN (Infinity-restore, commitQueue по id); CHECK_PENDING_SIGNAL_COMPLETION_FN (приоритет time→TP→SL, точные цены закрытия); PROCESS_PENDING_SIGNAL_CANDLES_FN (VWAP-окно, sync-reject-fallthrough в мониторинг, frameEndTime); все deferred-дренажи tick/backtest (двойной риск-релиз в гонках идемпотентен); createSignal (валидация до мутации, busy-чеклист); createTakeProfit/createStopLoss (снапшот + очистка + персист); wick-активация в backtest vs VWAP в live — осознанное моделирование лимитного ордера.

## Порядок выполнения

1. Восемь эмиссий (пункт 1) — механическая копия донор-паттерна, по принципу «баг чинится во всех копиях».
2. Комментарии-связки для гонки (пункт 2) и доки (пункт 3).
3. Тесты (пункт 4), полный прогон `npm run test` (ожидание: 797 существующих зелёные + новые; heat/schedule-статистика может измениться, если какой-то тест ловил «молчаливый дроп» — проверить и обновить ожидания осознанно).
4. Секция в TODO.md «пятый проход».
