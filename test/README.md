# Руководство по тестированию backtest-kit

## Архитектура системы

### Очередь сигналов (Signal Queue)

**КРИТИЧНО**: Система обрабатывает только ОДИН активный сигнал на символ в любой момент времени.

```typescript
// Система держит только один scheduled/opened сигнал для одного символа
// Новые сигналы НЕ обрабатываются пока предыдущий не закроется

signal #1: scheduled → opened → closed by TP
                                ↓
signal #2:                      scheduled → opened → closed by SL
                                                      ↓
signal #3:                                            scheduled → cancelled
```

**Последствия для тестов**:
- Если создаете несколько сигналов через `getSignal`, они обработаются ПОСЛЕДОВАТЕЛЬНО
- НЕ пытайтесь тестировать параллельную обработку сигналов - это невозможно по дизайну
- `getSignal` вызывается каждые `interval` минут, но новый сигнал создается только после завершения предыдущего

### Жизненный цикл сигнала

```
┌─────────────┐
│  getSignal  │ ← Стратегия генерирует сигнал
└──────┬──────┘
       ↓
┌─────────────┐
│  scheduled  │ ← Ждет активации (limit order)
└──────┬──────┘
       ↓
   ┌───┴────┐
   │  Цена  │
   │достигла│
   │priceOpen│
   └───┬────┘
       ↓
┌─────────────┐
│   opened    │ ← Позиция активна
└──────┬──────┘
       ↓
   ┌───┴────────────┐
   │ Цена достигла: │
   │ - TP           │
   │ - SL           │
   │ - time_expired │
   └───┬────────────┘
       ↓
┌─────────────┐
│   closed    │ ← Позиция закрыта
└─────────────┘
```

**Отмена scheduled сигнала**:
```
┌─────────────┐
│  scheduled  │
└──────┬──────┘
       ↓
   ┌───┴──────────┐
   │ Цена достигла│
   │ SL ДО priceOpen│
   │    ИЛИ        │
   │ time_expired  │
   └───┬──────────┘
       ↓
┌─────────────┐
│  cancelled  │ ← Сигнал отменен БЕЗ открытия позиции
└─────────────┘
```

## Как работают scheduled позиции

### Основная логика активации

Scheduled позиции активируются когда цена достигает `priceOpen`. Логика отличается для LONG и SHORT:

#### LONG позиции
```typescript
// LONG = покупаем дешевле, ждем падения цены ДО priceOpen
if (candle.low <= scheduled.priceOpen) {
  shouldActivate = true;
}
```

**Важно**: Используется `candle.low` - минимальная цена свечи!

**Пример**:
- `priceOpen = 42000`
- Свеча: `{ low: 41900, high: 42100 }`
- Результат: **Активация** (41900 <= 42000)

#### SHORT позиции
```typescript
// SHORT = продаем дороже, ждем роста цены ДО priceOpen
if (candle.high >= scheduled.priceOpen) {
  shouldActivate = true;
}
```

**Важно**: Используется `candle.high` - максимальная цена свечи!

### Приоритет StopLoss над активацией

**КРИТИЧНО**: StopLoss проверяется ПЕРЕД активацией!

#### LONG позиции
```typescript
if (candle.low <= scheduled.priceStopLoss) {
  shouldCancel = true;  // Отмена приоритетнее активации
}
else if (candle.low <= scheduled.priceOpen) {
  shouldActivate = true;
}
```

#### SHORT позиции
```typescript
if (candle.high >= scheduled.priceStopLoss) {
  shouldCancel = true;  // Отмена приоритетнее активации
}
else if (candle.high >= scheduled.priceOpen) {
  shouldActivate = true;
}
```

## Паттерны написания тестов

### Паттерн #1: Одиночный сигнал с простым сценарием

Используйте когда тестируете один изолированный сценарий (активация, TP, SL).

```javascript
test("Simple scenario: scheduled → opened → closed by TP", async ({ pass, fail }) => {
  addExchange({
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      for (let i = 0; i < limit; i++) {
        if (i < 5) {
          // Фаза 1: Ожидание (цена выше priceOpen)
          candles.push({ low: 42900, high: 43100, ... });
        } else if (i < 10) {
          // Фаза 2: Активация
          candles.push({ low: 41900, high: 42100, ... });
        } else {
          // Фаза 3: TP
          candles.push({ low: 42900, high: 43100, ... });
        }
      }
      return candles;
    }
  });

  let signalGenerated = false;
  addStrategy({
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;
      return { priceOpen: 42000, priceTakeProfit: 43000, priceStopLoss: 41000 };
    }
  });
});
```

### Паттерн #2: Множественные сигналы с предгенерацией свечей

**КРИТИЧНО для тестов с несколькими сигналами**: Все свечи должны быть созданы ЗАРАНЕЕ в первом вызове `getSignal`.

```javascript
test("Multiple signals: queue processing", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;

  let allCandles = [];

  // Создаем начальные свечи для getAveragePrice (минимум 5)
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: startTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    }
  });

  let signalCount = 0;

  addStrategy({
    getSignal: async () => {
      signalCount++;
      if (signalCount > 3) return null;

      // КРИТИЧНО: Генерируем ВСЕ свечи только в первый раз
      if (signalCount === 1) {
        allCandles = [];

        // Генерируем свечи на весь тест сразу (например 90 минут)
        for (let i = 0; i < 90; i++) {
          const timestamp = startTime + i * intervalMs;

          // Сигнал #1: минуты 0-19 (TP)
          if (i < 10) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 10 && i < 15) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 15 && i < 20) {
            allCandles.push({ timestamp, open: basePrice + 1000, high: basePrice + 1100, low: basePrice + 900, close: basePrice + 1000, volume: 100 });
          }

          // Сигнал #2: минуты 20-39 (SL)
          else if (i >= 20 && i < 30) {
            allCandles.push({ timestamp, open: basePrice + 500, high: basePrice + 600, low: basePrice + 400, close: basePrice + 500, volume: 100 });
          } else if (i >= 30 && i < 35) {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          } else if (i >= 35 && i < 40) {
            allCandles.push({ timestamp, open: basePrice - 1000, high: basePrice - 900, low: basePrice - 1100, close: basePrice - 1000, volume: 100 });
          }

          // Остальное время: нейтральные свечи
          else {
            allCandles.push({ timestamp, open: basePrice, high: basePrice + 100, low: basePrice - 100, close: basePrice, volume: 100 });
          }
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,
        priceTakeProfit: basePrice + 1000,
        priceStopLoss: basePrice - 1000,
        minuteEstimatedTime: 60,
      };
    }
  });

  addFrame({
    frameName: "90m-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T01:30:00Z"),  // Должно соответствовать количеству свечей!
  });
});
```

**Почему это важно**:
1. `getAveragePrice()` вызывает `getCandles` внутри себя
2. Если `allCandles` пуст при вызове `getAveragePrice`, получим ошибку
3. Нужно предзаполнить минимум 5 свечей для VWAP расчета
4. Затем в первом `getSignal` (signalCount === 1) сгенерировать ВСЕ свечи на весь тест

### Паттерн #3: Обработка ошибок

**Всегда** используйте `listenError` для перехвата ошибок, иначе тест зависнет.

```javascript
test("Error handling test", async ({ pass, fail }) => {
  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", { ... });

  await awaitSubject.toPromise();
  await sleep(1000);
  unsubscribeError();

  if (errorCaught) {
    fail(`Error: ${errorCaught.message || errorCaught}`);
    return;
  }

  // ... остальные проверки
});
```

### Типичные ошибки при написании тестов

#### Ошибка #1: Свечи попадают под StopLoss

```javascript
// ❌ НЕПРАВИЛЬНО: первая свеча попадает под SL!
addExchange({
  getCandles: async () => {
    return [{
      open: 41000,
      high: 41100,
      low: 40900,  // ❌ 40900 <= 41000 (SL) → отмена!
      close: 41000,
    }];
  }
});

addStrategy({
  getSignal: async () => ({
    priceOpen: 42000,
    priceStopLoss: 41000,  // SL выше чем candle.low!
    priceTakeProfit: 43000,
  })
});
```

**Результат**: Сигнал отменится по SL ДО активации!

**Решение**: Убедитесь что первые свечи НЕ попадают под SL:

```javascript
// ✅ ПРАВИЛЬНО: первые свечи выше SL
if (i < 5) {
  candles.push({
    open: 43000,
    high: 43100,
    low: 42900,  // ✅ 42900 > 41000 (SL) → OK!
    close: 43000,
  });
}
```

#### Ошибка #2: getAveragePrice вызывается когда нет свечей

```javascript
// ❌ НЕПРАВИЛЬНО: allCandles пуст при первом вызове
let allCandles = [];

addExchange({
  getCandles: async () => allCandles  // Пустой массив!
});

addStrategy({
  getSignal: async () => {
    const price = await getAveragePrice("BTCUSDT");  // ❌ Ошибка: no candles data
    return { priceOpen: price, ... };
  }
});
```

**Результат**: `ClientExchange getAveragePrice: no candles data for symbol=BTCUSDT`

**Решение #1**: Предзаполните минимум 5 свечей:

```javascript
// ✅ ПРАВИЛЬНО: Создаем начальные свечи ДО addExchange
let allCandles = [];
for (let i = 0; i < 5; i++) {
  allCandles.push({ timestamp: ..., open: 95000, high: 95100, low: 94900, close: 95000, volume: 100 });
}

addExchange({
  getCandles: async () => allCandles
});
```

**Решение #2**: Используйте константу вместо `getAveragePrice`:

```javascript
// ✅ ПРАВИЛЬНО: Используем basePrice константу
const basePrice = 95000;

addStrategy({
  getSignal: async () => {
    return {
      priceOpen: basePrice,  // Не вызываем getAveragePrice
      priceTakeProfit: basePrice + 1000,
      priceStopLoss: basePrice - 1000,
    };
  }
});
```

#### Ошибка #3: Frame endDate не соответствует количеству свечей

```javascript
// ❌ НЕПРАВИЛЬНО: генерируем 90 свечей, но frame только на 60 минут
allCandles = [];
for (let i = 0; i < 90; i++) {
  allCandles.push({ timestamp: startTime + i * 60000, ... });
}

addFrame({
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-01T01:00:00Z"),  // ❌ Только 60 минут, а свечей 90!
});
```

**Результат**: Последние 30 свечей не будут использованы, тест может не завершиться корректно.

**Решение**: Синхронизируйте количество свечей с frame:

```javascript
// ✅ ПРАВИЛЬНО: 90 свечей = 90 минут
allCandles = [];
for (let i = 0; i < 90; i++) {
  allCandles.push({ timestamp: startTime + i * 60000, ... });
}

addFrame({
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-01T01:30:00Z"),  // ✅ 90 минут!
});
```

#### Ошибка #4: Тест ожидает N сигналов, но система обработала меньше

```javascript
// ❌ НЕПРАВИЛЬНО: Ожидаем 3 открытых сигнала
if (signalsResults.opened.length !== 3) {
  fail(`Expected 3 opened signals, got ${signalsResults.opened.length}`);
}
```

**Проблема**: Система обрабатывает сигналы последовательно. Если frame недостаточно длинный или новые сигналы генерируются слишком быстро, система не успеет обработать все.

**Решение**: Используйте минимальные ожидания:

```javascript
// ✅ ПРАВИЛЬНО: Ожидаем минимум 2 сигнала
if (signalsResults.opened.length < 2) {
  fail(`Expected at least 2 opened signals, got ${signalsResults.opened.length}`);
}
```

## Основные тестовые файлы

### test/e2e/sanitize.test.mjs
Тесты валидации данных и базовой функциональности:
- **Тест #1**: Micro-profit eaten by fees (TP слишком близко)
- **Тест #2**: Extreme StopLoss rejected (>20% убыток)
- **Тест #3**: Excessive minuteEstimatedTime rejected (>30 дней)
- **Тест #4**: Negative prices rejected
- **Тест #5**: NaN prices rejected
- **Тест #6**: Infinity prices rejected
- **Тест #7**: Incomplete Binance candles rejected (аномальные цены)
- **Тест #8**: Basic LONG trading works (базовая торговля LONG)
- **Тест #9**: Basic SHORT trading works (базовая торговля SHORT)

### test/e2e/defend.test.mjs
Тесты защиты от потери денег:
- **Тест #1**: LONG limit order НЕ отменяется по SL до активации (цена не падает)
- **Тест #13**: Scheduled LONG отменяется по SL до активации (цена падает резко)
- **Тест #14**: Extreme volatility - TP vs SL приоритет
- **Тест #15**: Exchange.getCandles throws error
- **Тест #16**: listenSignalBacktest throws error

### test/e2e/close.test.mjs
Тесты закрытия позиций и граничных случаев:
- **Тест #1**: Position closes by time_expired (закрытие по истечению времени)
- **Тест #2**: Scheduled signal cancelled by time_expired (отмена scheduled по времени)
- **Тест #3**: SHORT position closes by stop_loss (SHORT закрывается по SL с убытком)
- **Тест #4**: LONG activates when candle.low exactly equals priceOpen (граничный случай)
- **Тест #5**: Small profit (0.5%) passes validation (маленький профит проходит валидацию)
- **Тест #6**: LONG position closes by stop_loss (LONG закрывается по SL с убытком)

### test/e2e/edge.test.mjs
Тесты граничных случаев и edge cases:
- **Тест #1**: Scheduled SHORT cancelled by SL BEFORE activation (отмена SHORT scheduled по SL)
- **Тест #2**: getAveragePrice works with zero volume (VWAP при нулевом volume)
- **Тест #3**: Very large profit (>100%) passes validation (огромный профит >100%)
- **Тест #4**: Multiple signals with different results (обработка очереди из 3 сигналов: TP, SL, cancelled)

### test/e2e/sequence.test.mjs
Тесты последовательностей сигналов:
- **Тест #1**: 5 signals with mixed results (TP, SL, cancelled, TP, SL)
- **Тест #2**: 3 consecutive TP signals (winning streak)
- **Тест #3**: 3 consecutive SL signals (losing streak)

**Особенности sequence тестов**:
- Демонстрируют последовательную обработку сигналов (queue)
- Используют паттерн предгенерации всех свечей в первом `getSignal`
- Проверяют что система корректно обрабатывает серии сигналов с разными исходами
- Используют минимальные ожидания (at least N) вместо точных значений

## Отладка тестов

### Добавление console.log

Если тест не работает, добавьте `console.log` в `src/client/ClientStrategy.ts`:

```typescript
// В функции PROCESS_SCHEDULED_SIGNAL_CANDLES_FN
for (let i = 0; i < candles.length; i++) {
  const candle = candles[i];

  console.log(`[DEBUG] candle[${i}]:`, {
    timestamp: candle.timestamp,
    low: candle.low,
    high: candle.high,
    priceOpen: scheduled.priceOpen,
    priceStopLoss: scheduled.priceStopLoss,
  });

  // ... остальной код
}
```

### Запуск одного теста

```bash
npm run build
npm test test/e2e/sanitize.test.mjs
```

### Проверка конкретного сценария

```bash
npm run build && npm test test/e2e/sanitize.test.mjs 2>&1 | grep "Basic trading"
```

### Отладка ошибки "no candles data"

Если получаете ошибку `ClientExchange getAveragePrice: no candles data for symbol=BTCUSDT`:

1. Убедитесь что `allCandles` предзаполнен минимум 5 свечами ДО `addExchange`
2. Проверьте что `getCandles` возвращает непустой массив
3. Рассмотрите использование `basePrice` константы вместо `getAveragePrice`

```javascript
// Вариант 1: Предзаполните свечи
let allCandles = [];
for (let i = 0; i < 5; i++) {
  allCandles.push({ timestamp: startTime + i * 60000, open: 95000, high: 95100, low: 94900, close: 95000, volume: 100 });
}

// Вариант 2: Используйте константу
const basePrice = 95000;
return {
  priceOpen: basePrice,
  priceTakeProfit: basePrice + 1000,
  priceStopLoss: basePrice - 1000,
};
```

## Частые проблемы

### Проблема: "Signal was NOT opened"

**Причина**: Свечи попадают под StopLoss до активации.

**Решение**: Убедитесь что `candle.low > priceStopLoss` для LONG позиций в первых свечах.

### Проблема: "Signal was NOT scheduled"

**Причина**: Сигнал отклонен валидацией.

**Решение**: Проверьте что:
- `priceTakeProfit > priceOpen` для LONG
- `priceStopLoss < priceOpen` для LONG
- Расстояние TP от priceOpen > минимального порога
- `minuteEstimatedTime` не превышает лимит

### Проблема: Тест зависает

**Причина**: Ошибка не обрабатывается через `listenError`.

**Решение**: Используйте `listenError` для перехвата ошибок:

```javascript
const unsubscribeError = listenError((error) => {
  errorCaught = error;
  awaitSubject.next();
});
```

### Проблема: "Expected N signals, got M" (M < N)

**Причина**: Система обрабатывает сигналы последовательно, не успевает обработать все за время frame.

**Решение**:
1. Увеличьте `endDate` в `addFrame` чтобы дать больше времени
2. Используйте минимальные ожидания: `if (count < 2)` вместо `if (count !== 3)`
3. Уменьшите количество сигналов в тесте

### Проблема: "test exited without ending"

**Причина**: Необработанная ошибка в коде теста или в системе.

**Решение**:
1. Добавьте `listenError` для перехвата ошибок
2. Проверьте что все promises корректно обрабатываются
3. Добавьте `try/catch` вокруг критичных участков
4. Проверьте что `awaitSubject.next()` вызывается в `listenDoneBacktest`

## Структура данных

### Свеча (ICandleData)
```typescript
{
  timestamp: number;  // Unix timestamp в миллисекундах
  open: number;       // Цена открытия
  high: number;       // Максимальная цена
  low: number;        // Минимальная цена
  close: number;      // Цена закрытия
  volume: number;     // Объем торгов
}
```

### Сигнал (ISignal)
```typescript
{
  position: "long" | "short";
  priceOpen: number;         // Цена активации
  priceTakeProfit: number;   // Take Profit
  priceStopLoss: number;     // Stop Loss
  minuteEstimatedTime: number;  // Время жизни в минутах
  note?: string;             // Комментарий (опционально)
}
```

### Результат сигнала
```typescript
{
  action: "scheduled" | "opened" | "closed" | "cancelled";
  closeReason?: "take_profit" | "stop_loss" | "time_expired";
  pnl: {
    pnlPercentage: number;   // PNL в процентах
    pnlAbsolute: number;     // PNL в абсолютных единицах
  };
}
```

## Лучшие практики

### 1. Используйте описательные имена

```javascript
// ❌ Плохо
test("Test 1", async ({ pass, fail }) => { ... });

// ✅ Хорошо
test("SANITIZE: Basic LONG trading works - system can open and close positions", async ({ pass, fail }) => { ... });
```

### 2. Добавляйте комментарии к фазам теста

```javascript
for (let i = 0; i < limit; i++) {
  if (i < 5) {
    // Фаза 1: Ожидание активации (цена выше priceOpen)
    candles.push({ ... });
  } else if (i >= 5 && i < 10) {
    // Фаза 2: Активация (цена достигает priceOpen)
    candles.push({ ... });
  } else {
    // Фаза 3: Закрытие по TP
    candles.push({ ... });
  }
}
```

### 3. Используйте константы для цен

```javascript
const basePrice = 95000;
const tpDistance = 1000;
const slDistance = 1000;

return {
  priceOpen: basePrice,
  priceTakeProfit: basePrice + tpDistance,
  priceStopLoss: basePrice - slDistance,
};
```

### 4. Проверяйте все важные состояния

```javascript
if (!scheduledResult) {
  fail("Signal was NOT scheduled!");
  return;
}

if (!openedResult) {
  fail("Signal was NOT opened!");
  return;
}

if (!closedResult) {
  fail("Signal was NOT closed!");
  return;
}

if (finalResult.closeReason !== "take_profit") {
  fail(`Expected "take_profit", got "${finalResult.closeReason}"`);
  return;
}
```

### 5. Используйте информативные сообщения pass/fail

```javascript
// ❌ Плохо
pass("Test passed");

// ✅ Хорошо
pass(`SYSTEM WORKS: Signal flow: scheduled → opened → closed by TP. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}% (expected ~2.38%)`);
```

### 6. Всегда добавляйте обработку ошибок для сложных тестов

```javascript
let errorCaught = null;
const unsubscribeError = listenError((error) => {
  errorCaught = error;
  awaitSubject.next();
});

// ... после теста
unsubscribeError();

if (errorCaught) {
  fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
  return;
}
```

## Полный пример комплексного теста

См. [test/e2e/sequence.test.mjs](./e2e/sequence.test.mjs) для примера теста с:
- Предгенерацией свечей
- Множественными сигналами
- Обработкой ошибок
- Минимальными ожиданиями
- Подробными проверками
