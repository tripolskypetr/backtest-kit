# Plan: Infinite minuteEstimatedTime — дозапрос свечей по мере надобности

## Context

Сейчас `BacktestLogicPrivateService` запрашивает ровно `signal.minuteEstimatedTime + buffer` свечей **одним запросом** перед вызовом `backtest()`. Если стратегия хочет работать неограниченно долго (открытый сигнал без таймаута), это невозможно — `minuteEstimatedTime` должно быть конечным числом, а `PROCESS_PENDING_SIGNAL_CANDLES_FN` бросает исключение если свечи кончились до истечения таймера.

Цель: поддержать `minuteEstimatedTime = Infinity` — сигнал работает до закрытия по TP/SL или до явного `closePending()`, а свечи подгружаются пачками по мере надобности.

## Affected Files

- `src/client/ClientStrategy.ts` — `PROCESS_PENDING_SIGNAL_CANDLES_FN`, `PROCESS_SCHEDULED_SIGNAL_CANDLES_FN`, `VALIDATE_SIGNAL_FN`
- `src/lib/services/logic/private/BacktestLogicPrivateService.ts` — метод `run()`, блоки `opened` и `scheduled`
- `src/interfaces/Strategy.interface.ts` — тип `minuteEstimatedTime` в `ISignalDto`

## Подход

### 1. `Strategy.interface.ts` — разрешить Infinity в типе

`minuteEstimatedTime: number` уже позволяет `Infinity` на уровне TS (тип `number` включает `Infinity`). Менять тип не нужно, но нужно обновить JSDoc комментарий.

### 2. `ClientStrategy.ts` — VALIDATE_SIGNAL_FN

Текущие проверки (строки ~783–818):
```ts
if (signal.minuteEstimatedTime <= 0) { errors.push(...) }
if (!Number.isInteger(signal.minuteEstimatedTime)) { errors.push(...) }
if (!isFinite(signal.minuteEstimatedTime)) { errors.push(...) }
```

Изменить: снять проверки `!Number.isInteger` и `!isFinite` для `Infinity`:
- `Infinity > 0` → OK
- Разрешить `Infinity` как специальный маркер "без таймаута"
- Сохранить проверку `<= 0`

### 3. `ClientStrategy.ts` — PROCESS_PENDING_SIGNAL_CANDLES_FN

Текущая логика (строки ~4010–4248):
- Итерирует по свечам
- После цикла, если `elapsedTime < maxTimeToWait` → бросает исключение (недостаточно свечей)
- Если `elapsedTime >= maxTimeToWait` → закрывает по `time_expired`

При `minuteEstimatedTime = Infinity`:
- `maxTimeToWait = Infinity * 60 * 1000 = Infinity`
- `elapsedTime < Infinity` → **всегда true** → функция всегда бросит исключение

**Решение**: не менять `PROCESS_PENDING_SIGNAL_CANDLES_FN`. Функция остаётся как есть — она работает корректно, если ей передать достаточно свечей. Дозапрос делается на уровне `BacktestLogicPrivateService`.

### 4. `BacktestLogicPrivateService.ts` — основное изменение

**Блок `opened` (строки ~374–513):**

Текущий код:
```ts
const totalCandles = signal.minuteEstimatedTime + GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;
candles = await this.exchangeCoreService.getNextCandles(symbol, "1m", totalCandles, bufferStartTime, true);
backtestResult = await this.strategyCoreService.backtest(symbol, candles, when, true, {...});
```

Новый код при `minuteEstimatedTime === Infinity`:
```ts
if (signal.minuteEstimatedTime === Infinity) {
  // Итерационный цикл с дозапросом
  backtestResult = await this._backtestWithInfiniteTime(symbol, signal, when, bufferStartTime, bufferMinutes);
} else {
  // существующий код
}
```

Вспомогательный приватный метод `_backtestWithInfiniteTime`:
```
loop:
  1. Запросить CHUNK_SIZE (=CC_MAX_CANDLES_PER_REQUEST) свечей начиная от lastEndTime
  2. Передать accumulated_candles в backtest()
  3. Если backtest() вернул результат (closed/cancelled) → выйти из loop
  4. Если backtest() бросил исключение с сообщением "Insufficient candle data" →
     запросить следующую порцию и повторить
  5. Если getNextCandles вернул [] (достигли Date.now()) → закрыть по time_expired вручную
     (вызвать closePending + backtest снова)
```

**Но есть проблема**: `backtest()` мутирует состояние стратегии — если он бросает исключение на нехватке данных, состояние сигнала частично изменено (обработаны partials, callbacks вызваны за часть свечей). Повторный вызов `backtest()` с новым батчем свечей невозможен — нельзя "продолжить" с середины.

**Правильное решение**: передавать свечи накопленным буфером в `backtest()` который ожидает полный массив, НО:
- Нельзя запросить бесконечно много свечей заранее
- `PROCESS_PENDING_SIGNAL_CANDLES_FN` обрабатывает свечи **итеративно** и остановится как только найдёт TP/SL

Реальный вариант: `PROCESS_PENDING_SIGNAL_CANDLES_FN` **не мутирует** стратегию до закрытия — она вызывает коллбеки (включая `onActivePing`), но `setPendingSignal(null)` только в `CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN`. Если свечи кончились без TP/SL — функция **бросает исключение** и сигнал остаётся открытым (`_pendingSignal` не очищен).

Значит: после поглощения исключения "Insufficient candle data" можно сделать ещё один вызов `backtest()` с новой порцией свечей (включая VWAP буфер).

**Итоговая стратегия в BacktestLogicPrivateService:**

```typescript
// Для Infinity minuteEstimatedTime:
const CHUNK = GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST;
const bufferMinutes = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - ACTIVE_CANDLE_INCLUDED;

let chunkStart = bufferStartTime; // начальная точка включая буфер
let backtestResult: IStrategyBacktestResult | undefined;

while (!backtestResult) {
  let chunkCandles: ICandleData[];
  try {
    chunkCandles = await this.exchangeCoreService.getNextCandles(symbol, "1m", CHUNK, chunkStart, true);
  } catch (error) { /* handle */ }

  if (!chunkCandles.length) {
    // Достигли конца фрейма — стратегия не закрылась по TP/SL
    // Принудительно закрыть: вызвать closePending() + backtest() с пустым/мини массивом
    // ИЛИ вызвать CLOSE_PENDING_SIGNAL_IN_BACKTEST_FN напрямую
    // Решение: вызвать strategyCoreService.backtest() с одной "dummy" свечой (последняя известная)
    // чтобы сработал путь _closedSignal из closePending()
    // НО: проще всего — стратегия вызывает closePending() через setClosedSignal,
    // и следующий backtest() с любыми свечами обработает _closedSignal
    //
    // Реально: BacktestLogicPrivateService напрямую не имеет доступа к _closedSignal.
    // Самый чистый способ: вызвать strategyCoreService.closePending()
    // затем backtest() с последним чанком (хотя бы 1 свеча) —
    // backtest() увидит _closedSignal и вернёт closed результат с текущей ценой.
    break; // → после loop принудительно закрыть через closePending + повторный backtest
  }

  try {
    backtestResult = await this.strategyCoreService.backtest(symbol, chunkCandles, when, true, {...});
  } catch (error) {
    if (/* "Insufficient candle data" */) {
      // Сигнал остался открытым, продолжаем
      // Следующий chunk начинается от последней свечи предыдущего
      chunkStart = new Date(chunkCandles[chunkCandles.length - 1].timestamp + 60_000 - bufferMinutes * 60_000);
      continue;
    }
    throw error; // другая ошибка
  }
}
```

**Проблема с VWAP буфером между чанками**: при переходе к следующему чанку нужно включить `bufferMinutes` предыдущих свечей чтобы VWAP рассчитался правильно для первых свечей нового чанка. Уже обрабатывается: начало следующего чанка = конец предыдущего - bufferMinutes.

**Проблема с уже вызванными коллбеками**: `onActivePing` и `CALL_PARTIAL_*` вызываются для каждой свечи. При повторном вызове `backtest()` со следующим чанком — первые `bufferMinutes` свечей пропускаются (буфер), и обработка начинается с правильного места. Коллбеки НЕ будут дублированы.

### 5. Для блока `scheduled` в BacktestLogicPrivateService

Аналогично: при `minuteEstimatedTime = Infinity` запрашивать только `bufferMinutes + CC_SCHEDULE_AWAIT_MINUTES + CHUNK` свечей вместо `bufferMinutes + CC_SCHEDULE_AWAIT_MINUTES + Infinity`. После активации scheduled сигнала — применить тот же итерационный подход для pending фазы.

## Детальные изменения

### `src/interfaces/Strategy.interface.ts` (~строка 43)
Обновить JSDoc: добавить `Infinity` как допустимое значение — позиция работает до TP/SL.

### `src/client/ClientStrategy.ts`

**VALIDATE_SIGNAL_FN** (~строки 783–818):
```ts
// Было:
if (!Number.isInteger(signal.minuteEstimatedTime)) { errors.push(...) }
if (!isFinite(signal.minuteEstimatedTime)) { errors.push(...) }

// Стало:
if (signal.minuteEstimatedTime !== Infinity && !Number.isInteger(signal.minuteEstimatedTime)) {
  errors.push(...)
}
// Убрать проверку isFinite (Infinity — допустимое значение)
```

**CC_MAX_SIGNAL_LIFETIME_MINUTES** check (~строка 808):
```ts
// Убрать для Infinity (не применять limit к бесконечным сигналам)
if (GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES && signal.minuteEstimatedTime !== Infinity) {
  ...
}
```

### `src/lib/services/logic/private/BacktestLogicPrivateService.ts`

Добавить константу: `const INFINITE_SIGNAL_CHUNK_MINUTES = GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST;`

**Блок `opened` (~строки 374–513):** обернуть существующий `getNextCandles + backtest` в условие:
```ts
if (signal.minuteEstimatedTime !== Infinity) {
  // существующий код
} else {
  backtestResult = await this._runInfiniteBacktest(symbol, signal, when, bufferMinutes, bufferStartTime);
}
```

Добавить приватный метод `_runInfiniteBacktest` с итерационным дозапросом (см. выше).

**Блок `scheduled` (~строки 175–370):** аналогично изменить `candlesNeeded`:
```ts
// Было:
const candlesNeeded = bufferMinutes + CC_SCHEDULE_AWAIT_MINUTES + signal.minuteEstimatedTime + SCHEDULE_ACTIVATION_CANDLE_SKIP;

// Стало:
const pendingMinutes = signal.minuteEstimatedTime === Infinity
  ? INFINITE_SIGNAL_CHUNK_MINUTES
  : signal.minuteEstimatedTime;
const candlesNeeded = bufferMinutes + CC_SCHEDULE_AWAIT_MINUTES + pendingMinutes + SCHEDULE_ACTIVATION_CANDLE_SKIP;
```

После получения `backtestResult` из scheduled — если `minuteEstimatedTime === Infinity` и результат не "closed"/"cancelled" — продолжить итерационный дозапрос.

## Обнаружение "Insufficient candle data" error

В `PROCESS_PENDING_SIGNAL_CANDLES_FN` (~строка 4219) брошенная ошибка содержит текст:
`"ClientStrategy backtest: Insufficient candle data for pending signal."`

В `BacktestLogicPrivateService` перехватывать по этому ключевому тексту:
```ts
if (getErrorMessage(error).includes("Insufficient candle data")) { /* continue */ }
```

## Verification

1. Написать e2e тест: стратегия с `minuteEstimatedTime: Infinity`, TP далеко, SL близко — должна закрыться по SL
2. Написать e2e тест: `minuteEstimatedTime: Infinity`, TP достигается через 1200 минут (> CC_MAX_CANDLES_PER_REQUEST=1000) — должна закрыться по TP
3. Существующие 88 тестов в `test/spec/dca.test.mjs` и 28 e2e тестов в `test/e2e/dca.test.mjs` должны пройти без изменений
4. `npm test` / `node test/index.mjs`
