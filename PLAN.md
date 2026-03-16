# Plan: Infinite minuteEstimatedTime — промежуточный `active` вместо исключения

## Context

`PROCESS_PENDING_SIGNAL_CANDLES_FN` в `ClientStrategy` бросает исключение `"Insufficient candle data"` когда свечи кончились, а `elapsedTime < maxTimeToWait`. При `minuteEstimatedTime = Infinity` это условие всегда true — сигнал не может корректно завершиться через `backtest()`.

Цель: вместо исключения возвращать `IStrategyTickResultActive` — промежуточное состояние "свечи кончились, сигнал всё ещё открыт". `BacktestLogicPrivateService` видит `active` и запрашивает следующий чанк свечей, вызывая `backtest()` повторно до получения `closed`/`cancelled`.

---

## Затронутые файлы

- `src/interfaces/Strategy.interface.ts`
- `src/client/ClientStrategy.ts`
- `src/lib/services/core/StrategyCoreService.ts`
- `src/lib/services/logic/private/BacktestLogicPrivateService.ts`

---

## Изменения

### 1. `src/interfaces/Strategy.interface.ts`

**`IStrategyBacktestResult`** (~строка 786):
```ts
// Было:
export type IStrategyBacktestResult =
  | IStrategyTickResultOpened
  | IStrategyTickResultScheduled
  | IStrategyTickResultClosed
  | IStrategyTickResultCancelled;

// Стало:
export type IStrategyBacktestResult =
  | IStrategyTickResultOpened
  | IStrategyTickResultScheduled
  | IStrategyTickResultActive
  | IStrategyTickResultClosed
  | IStrategyTickResultCancelled;
```

**JSDoc `minuteEstimatedTime`** (~строка 43):
```ts
/**
 * Expected duration in minutes before time_expired.
 * Use `Infinity` for no timeout — position stays open until TP/SL or explicit closePending().
 */
minuteEstimatedTime: number;
```

---

### 2. `src/client/ClientStrategy.ts`

#### VALIDATE_SIGNAL_FN (~строки 783–818)

Убрать блокировку `Infinity`. Три изменения:

```ts
// 1. Убрать: !Number.isInteger → заменить:
if (signal.minuteEstimatedTime !== Infinity && !Number.isInteger(signal.minuteEstimatedTime)) {
  errors.push(`minuteEstimatedTime must be an integer (whole number), got ${signal.minuteEstimatedTime}`);
}

// 2. Убрать проверку isFinite полностью (Infinity — допустимое значение)
// Строку: if (!isFinite(signal.minuteEstimatedTime)) { errors.push(...) }  — УДАЛИТЬ

// 3. CC_MAX_SIGNAL_LIFETIME_MINUTES — пропускать для Infinity:
if (GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES
    && signal.minuteEstimatedTime !== Infinity
    && signal.minuteEstimatedTime > GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES) {
  errors.push(...)
}
```

#### PROCESS_PENDING_SIGNAL_CANDLES_FN (~строки 3975–4250)

Изменить return type: `Promise<IStrategyTickResultClosed>` → `Promise<IStrategyTickResultClosed | IStrategyTickResultActive>`

После цикла (строки ~4207–4248), вместо безусловного throw:

```ts
// Текущее:
if (elapsedTime < maxTimeToWait) {
  throw new Error(`ClientStrategy backtest: Insufficient candle data...`);
}

// Новое:
if (elapsedTime < maxTimeToWait) {
  if (signal.minuteEstimatedTime === Infinity) {
    // Свечи кончились — сигнал всё ещё открыт.
    // Возвращаем промежуточный active, caller запросит следующий чанк.
    const result: IStrategyTickResultActive = {
      action: "active",
      signal: TO_PUBLIC_SIGNAL(signal, lastPrice),
      currentPrice: lastPrice,
      strategyName: self.params.method.context.strategyName,
      exchangeName: self.params.method.context.exchangeName,
      frameName: self.params.method.context.frameName,
      symbol: self.params.execution.context.symbol,
      percentTp: 0,
      percentSl: 0,
      pnl: toProfitLossDto(signal, lastPrice),
      backtest: self.params.execution.context.backtest,
      createdAt: closeTimestamp,
    };
    return result;
  }
  throw new Error(`ClientStrategy backtest: Insufficient candle data...`);
}
```

#### `backtest()` метод (~строка 5487)

Обновить сигнатуру:
```ts
// Было:
public async backtest(...): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled>

// Стало:
public async backtest(...): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive>
```

---

### 3. `src/lib/services/core/StrategyCoreService.ts`

Обновить возвращаемый тип метода `backtest()`:
```ts
// Было:
): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled>

// Стало:
): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive>
```

---

### 4. `src/lib/services/logic/private/BacktestLogicPrivateService.ts`

#### Блок `opened` (~строки 374–514)

Заменить одиночный вызов `getNextCandles + backtest` на итерационный цикл при `Infinity`:

```ts
const bufferMinutes = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - ACTIVE_CANDLE_INCLUDED;
const bufferStartTime = new Date(when.getTime() - bufferMinutes * 60 * 1000);

let backtestResult: IStrategyBacktestResult;

if (signal.minuteEstimatedTime !== Infinity) {
  // Существующий код — одиночный запрос
  const totalCandles = signal.minuteEstimatedTime + GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;
  candles = await this.exchangeCoreService.getNextCandles(symbol, "1m", totalCandles, bufferStartTime, true);
  if (!candles.length) { i++; continue; }
  backtestResult = await this.strategyCoreService.backtest(symbol, candles, when, true, context);
} else {
  // Infinity: итерационный дозапрос чанками
  const CHUNK = GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST;
  const bufferMs = (GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - 1) * 60_000;
  let chunkStart = bufferStartTime;
  let lastChunkCandles: ICandleData[] = [];

  while (true) {
    const chunkCandles = await this.exchangeCoreService.getNextCandles(symbol, "1m", CHUNK, chunkStart, true);

    if (!chunkCandles.length) {
      // Конец фрейма — сигнал не закрылся по TP/SL
      // Принудительно закрыть по time_expired через closePending + повторный backtest
      await this.strategyCoreService.closePending(true, symbol, context);
      backtestResult = await this.strategyCoreService.backtest(symbol, lastChunkCandles, when, true, context);
      break;
    }

    lastChunkCandles = chunkCandles;
    const chunkResult = await this.strategyCoreService.backtest(symbol, chunkCandles, when, true, context);

    if (chunkResult.action !== "active") {
      backtestResult = chunkResult;
      break;
    }

    // Сдвигаем начало следующего чанка с учётом VWAP буфера
    chunkStart = new Date(chunkCandles[chunkCandles.length - 1].timestamp + 60_000 - bufferMs);
  }
}
// Далее: yield backtestResult, продвижение i
```

#### Блок `scheduled` (~строки 175–371)

Ограничить `candlesNeeded` при Infinity и добавить итерационный дозапрос после первого `backtest()`:

```ts
// Расчёт свечей:
const pendingPhaseMinutes = signal.minuteEstimatedTime === Infinity
  ? GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST
  : signal.minuteEstimatedTime;
const candlesNeeded = bufferMinutes + GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES + pendingPhaseMinutes + SCHEDULE_ACTIVATION_CANDLE_SKIP;

// ... getNextCandles с candlesNeeded ...

// После первого backtest():
backtestResult = await this.strategyCoreService.backtest(symbol, candles, when, true, context);

// Если infinite и signal активировался но ещё не закрылся:
if (backtestResult.action === "active" && signal.minuteEstimatedTime === Infinity) {
  const CHUNK = GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST;
  const bufferMs = (GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT - 1) * 60_000;
  let lastChunkCandles = candles;
  let chunkStart = new Date(candles[candles.length - 1].timestamp + 60_000 - bufferMs);

  while (backtestResult.action === "active") {
    const chunkCandles = await this.exchangeCoreService.getNextCandles(symbol, "1m", CHUNK, chunkStart, true);

    if (!chunkCandles.length) {
      await this.strategyCoreService.closePending(true, symbol, context);
      backtestResult = await this.strategyCoreService.backtest(symbol, lastChunkCandles, when, true, context);
      break;
    }

    lastChunkCandles = chunkCandles;
    backtestResult = await this.strategyCoreService.backtest(symbol, chunkCandles, when, true, context);
    chunkStart = new Date(chunkCandles[chunkCandles.length - 1].timestamp + 60_000 - bufferMs);
  }
}
```

---

## Продвижение `i` после Infinity сигнала

Текущий код продвигает `i` на `signal.minuteEstimatedTime + N`. Для Infinity это сломает цикл.

После получения итогового `backtestResult` при Infinity — продвигать на фактически прошедшее время:
```ts
const actualElapsedMinutes = Math.ceil(
  (backtestResult.closeTimestamp - signal.pendingAt) / 60_000
);
// Использовать actualElapsedMinutes вместо signal.minuteEstimatedTime
```

Точные строки выяснить при чтении `BacktestLogicPrivateService` блока `opened` (конец блока после `yield`).

---

---

## Verification

1. Unit: сигнал с `minuteEstimatedTime = Infinity`, TP на +5% → закрывается по TP
2. Unit: `minuteEstimatedTime = Infinity`, SL на -2% → закрывается по SL
3. e2e: сигнал с `minuteEstimatedTime = Infinity`, TP достигается после 1200 минут (> CC_MAX_CANDLES_PER_REQUEST) → закрывается по TP с правильным PNL
4. Все 88 тестов в `test/spec/dca.test.mjs` и 28 в `test/e2e/dca.test.mjs` — без изменений
5. `node test/index.mjs`
