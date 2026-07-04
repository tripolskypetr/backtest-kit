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
// КРИТИЧНО для LONG:
// - priceOpen > priceStopLoss (по валидации)
// - Активация: low <= priceOpen (цена упала до входа)
// - Отмена: low <= priceStopLoss (цена пробила SL)

if (candle.low <= scheduled.priceStopLoss) {
  shouldCancel = true;  // Отмена приоритетнее активации
}
else if (candle.low <= scheduled.priceOpen) {
  shouldActivate = true;
}
```

**EDGE CASE для LONG**: Если на ОДНОЙ свече `low <= priceStopLoss` И `low <= priceOpen`:
- Приоритет у **отмены**!
- StopLoss пробит ДО или ВМЕСТЕ с активацией
- Сигнал **НЕ открывается**, сразу переходит в `cancelled`

**Пример edge case**:
```javascript
// Сигнал: priceOpen = 42000, priceStopLoss = 41000
// Свеча: { low: 40500, high: 43000 }
// Результат: CANCELLED (не opened!)
// Объяснение: low=40500 пробивает и SL (41000) и priceOpen (42000)
//             но проверка SL идет первой → shouldCancel=true
```

#### SHORT позиции
```typescript
// КРИТИЧНО для SHORT:
// - priceOpen < priceStopLoss (по валидации)
// - Активация: high >= priceOpen (цена выросла до входа)
// - Отмена: high >= priceStopLoss (цена пробила SL)

if (candle.high >= scheduled.priceStopLoss) {
  shouldCancel = true;  // Отмена приоритетнее активации
}
else if (candle.high >= scheduled.priceOpen) {
  shouldActivate = true;
}
```

**EDGE CASE для SHORT**: Если на ОДНОЙ свече `high >= priceStopLoss` И `high >= priceOpen`:
- Приоритет у **отмены**!
- StopLoss пробит ДО или ВМЕСТЕ с активацией
- Сигнал **НЕ открывается**, сразу переходит в `cancelled`

**Пример edge case**:
```javascript
// Сигнал: priceOpen = 42000, priceStopLoss = 44000
// Свеча: { low: 41000, high: 45000 }
// Результат: CANCELLED (не opened!)
// Объяснение: high=45000 пробивает и SL (44000) и priceOpen (42000)
//             но проверка SL идет первой → shouldCancel=true
```

---

## ⚠️ EDGE CASE: Одновременное достижение SL и priceOpen

**Критическая ситуация**: Что происходит, когда цена на ОДНОЙ свече достигает и StopLoss, и priceOpen одновременно?

### Поведение системы

Система **ВСЕГДА отменяет** сигнал в этом случае, позиция НЕ открывается.

**Логика**:
1. Проверка StopLoss выполняется **ДО** проверки активации
2. Если обе проверки срабатывают на одной свече → приоритет у отмены
3. Это защищает от открытия позиции, которая мгновенно закрылась бы по SL

### Примеры

**LONG позиция - резкое падение**:
```javascript
// Настройка сигнала
{
  position: "long",
  priceOpen: 42000,       // Вход при падении до 42k
  priceStopLoss: 41000,   // SL на 41k
}

// Приходит экстремальная свеча
{
  low: 40500,   // ⚠️ Пробивает ОБА уровня!
  high: 43000,
}

// Результат: CANCELLED
// Почему: low (40500) <= priceStopLoss (41000) → shouldCancel=true
//         Проверка активации даже не выполняется
```

**SHORT позиция - резкий рост**:
```javascript
// Настройка сигнала
{
  position: "short",
  priceOpen: 42000,       // Вход при росте до 42k
  priceStopLoss: 44000,   // SL на 44k
}

// Приходит экстремальная свеча
{
  low: 41000,
  high: 45000,   // ⚠️ Пробивает ОБА уровня!
}

// Результат: CANCELLED
// Почему: high (45000) >= priceStopLoss (44000) → shouldCancel=true
//         Проверка активации даже не выполняется
```

### Почему это важно для тестов

При написании тестов для scheduled сигналов **избегайте** свечей с экстремальной волатильностью:

```javascript
// ❌ ОПАСНО: Может вызвать edge case
const candle = {
  low: priceStopLoss - 1000,   // Далеко ниже SL
  high: priceTakeProfit + 1000, // Далеко выше TP
};

// ✅ БЕЗОПАСНО: Контролируемая активация
const candle = {
  low: priceOpen - 100,         // Чуть ниже входа
  high: priceOpen + 500,        // Выше входа, но не TP
};
```

### Когда тестировать edge case

Создайте отдельный тест для проверки этого поведения:

```javascript
test("EDGE: Scheduled cancelled when SL hit before activation", async ({ pass, fail }) => {
  addStrategy({
    getSignal: async () => ({
      position: "long",
      priceOpen: 42000,
      priceStopLoss: 41000,
      priceTakeProfit: 43000,
    })
  });

  addExchange({
    getCandles: async () => [{
      low: 40500,   // Пробивает и SL, и priceOpen
      high: 43000,
      // ...
    }]
  });

  // Ожидаем: scheduled → cancelled (НЕ opened!)
});
```

См. [test/e2e/defend.test.mjs](./e2e/defend.test.mjs) тест #13 для реального примера.

---

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

## Изоляция worker-testbed, live-тики и гейты

### Каждый test() — свежий инстанс backtest-kit

worker-testbed запускает каждый `test()` в отдельном воркере и заново загружает
`build/index.mjs`. У каждого теста — свои синглтоны (`Broker`, `lib`-сервисы,
сабжекты, `Persist*Adapter`). Следствия:

- **Мокать можно прямым присваиванием** (`lib.someService.method = ...`, патч
  синглтонов, `Broker.useBrokerAdapter(...)`) — восстанавливать не обязательно,
  воркер умирает после теста. Глобальные слушатели (`listenDoneBacktest`,
  `listenScheduleEvent`) не пересекаются между тестами.
- Глобальный `test/config/setup.mjs` ставит все `Persist*Adapter.useDummy()`.
  Тесту, которому нужна реальная персистенция, — локально `useJson()` в скоупе
  `test()` (восстановление в `finally` — хорошая гигиена, но не обязательная).

### Backtest.run vs Backtest.background

- **`for await (const r of Backtest.run(symbol, context))`** — async-генератор,
  детерминированное завершение без done-слушателя. Предпочтителен, когда нужны
  только терминальные результаты (`opened`/`closed`/`cancelled`).
- **`Backtest.background()` + `listenDoneBacktest(() => awaitSubject.next())`** —
  конвенция для тестов, которым нужны промежуточные события через `listen*`
  (schedule events, partial-коллбеки и т.д.); генератор их не отдаёт.

### Live-тики напрямую через ядро

`strategyCoreService` di-scoped — вызовы вне command-слоя оборачиваются в
method-контекст:

```javascript
const context = { strategyName, exchangeName, frameName: "" };
const runTick = (when) =>
  MethodContextService.runInContext(
    async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
    context,
  );

const tick1 = await runTick(new Date(t0));            // "scheduled"
await MethodContextService.runInContext(
  async () => await lib.strategyCoreService.stopStrategy(false, "BTCUSDT", context),
  context,
);
const tick2 = await runTick(new Date(t0 + 60_000));   // "cancelled"
```

Троттл `getSignal` привязан к `interval` стратегии: чтобы доказать next-tick
retry после risk/sync-отказа, берите `interval: "1h"` и тикайте с шагом в минуту —
без отката троттла второй tick не вызвал бы `getSignal` вовсе.

**Два контекста — кто какой создаёт.** tick/backtest требуют ОБА контекста:
method (strategyName/exchangeName/frameName) и execution (symbol/when/backtest).
`lib.strategyCoreService.tick(...)` сам оборачивает вызов в
`ExecutionContextService.runInContext({symbol, when, backtest})` из своих
аргументов — поэтому в паттерне выше снаружи хватает одного
`MethodContextService.runInContext`. Если спускаться НИЖЕ core-слоя
(`strategyConnectionService.tick`, `strategy.tick()` на инстансе) — оборачивайте
в оба контекста вручную. Остальные методы ClientStrategy (deferred-команды,
getters, partial/trailing/breakeven, dispose) контекстов НЕ требуют — identity
(symbol/backtest/strategy-triple) читается из статических ctor-params. Два
исключения, где нужен execution-контекст, — это ВРЕМЯ (`when` симулируется,
wall clock не замена): restore-ветки `waitForInit` (метки коллбеков +
`getAveragePrice` читает `when` внутри ClientExchange; пустой restore
контекст-фри) и ленивый `when` в `setPendingSignal` для метки onWrite
(вызывается только из tick/backtest-пайплайнов).

### Гейты order-sync / order-check (live-only)

Оба контракта несут `type: "schedule" | "active"`:

- **`listenSync(fn, true)`** — `OrderSyncContract` (syncSubject). `action:
  "signal-open"` с `type: "schedule"` — РАЗМЕЩЕНИЕ resting-ордера при создании
  scheduled (throw → scheduled не регистрируется, ретрай next tick); с `type:
  "active"` — открытие позиции/филл активации (throw при активации —
  ТЕРМИНАЛЬНАЯ отмена, при свежем открытии — ретрай next tick). Фильтруйте по
  `event.type`: слушатель «на все signal-open» поймает и placement-события.
- **`listenCheck(fn, true)`** — `OrderCheckContract` (syncPendingSubject),
  пинг «ордер ещё жив?». Throw при `"active"` → закрытие `closed`, при
  `"schedule"` → отмена scheduled `user`. Backtest эти события не эмитит.
- Второй аргумент `true` подавляет discouraged-предупреждения в консоли.
- В Action-хендлере методы `orderSync`/`orderCheck` ЗАПРЕЩЕНЫ валидатором схемы —
  используйте `callbacks: { onOrderSync, onOrderCheck }` в `addActionSchema`
  или Broker-адаптер.

### Тестирование Broker

```javascript
Broker.useBrokerAdapter({            // Partial<IBroker> — только нужные методы
  onSignalOpenCommit: async (p) => { /* p.type: "schedule" | "active" */ },
  onOrderCheck: async (p) => { /* throw = ордер не найден */ },
  onSignalScheduleCancelled: async (p) => { /* p.reason */ },
});
Broker.enable();                     // без адаптера — throw
try { /* тики */ } finally { Broker.disable(); }
```

Брокер live-only: в backtest sync-гейты short-circuit'ятся до сабжектов, а все
`commit*`-методы скипают `payload.backtest` — адаптер обязан получить ровно 0
вызовов за бектест-прогон (см. broker.test.mjs #3).

### Манки-патч order-коллбеков в backtest (di-kit)

Штатно order-события в backtest НЕ эмитятся: `CREATE_SYNC_FN` short-circuit'ит
`event.backtest` ДО `syncSubject.next()` (см. probe: scheduled-цикл в backtest
даёт `SCHEDULE scheduled → SIGNAL opened → SIGNAL closed` и ноль order-событий).
Если тесту нужно наблюдать/гейтить ордера в backtest — манки-патч:

```javascript
// 1. di-kit: lib.someService — InstanceAccessor, реальный сервис — его ПРОТОТИП.
//    Внутренние вызовы this.getStrategy идут по реальному инстансу (arrow-поля),
//    присваивание на аксессор НЕ сработает.
const realService = Object.getPrototypeOf(lib.strategyConnectionService);

// 2. Backtest.run() fire-and-forget чистит мемоизацию стратегий — патчить
//    конкретный инстанс бесполезно. Оборачиваем САМ getStrategy:
const originalGetStrategy = realService.getStrategy;
const wrapped = (...args) => {
  const strategy = originalGetStrategy(...args);
  if (!strategy.__patched) {
    strategy.__patched = true;
    const original = strategy.params.onOrderSync;
    strategy.params.onOrderSync = async (event) => {
      record(event);                  // наблюдение
      if (shouldReject(event)) return false; // гейт работает и в backtest
      return await original(event);
    };
  }
  return strategy;
};
// 3. Сохранить memoize-API, которым пользуется connection-сервис:
wrapped.clear = originalGetStrategy.clear;
wrapped.has = originalGetStrategy.has;
wrapped.values = originalGetStrategy.values;
realService.getStrategy = wrapped;
```

Порядок событий полного цикла через патч: `signal-open/schedule` (размещение) →
`signal-open/active` (филл активации) → `signal-close/active` (закрытие).
Рабочий пример — «monkey-patched onOrderSync» в strategy.test.mjs.

### Проверка гипотез отдельным скриптом

Прежде чем ставить в сьют тест с риском зависания (новый API, `for await` по
генератору, незнакомый паттерн ожидания) — прогоните гипотезу standalone-скриптом
с вотчдогом:

```javascript
// probe.mjs: import setup.mjs и build/index.mjs по АБСОЛЮТНЫМ путям
const watchdog = setTimeout(() => { console.error("HUNG"); process.exit(2); }, 60_000);
// ... сценарий ...
clearTimeout(watchdog);
```

Полный сьют идёт минуты — зависший тест стоит дороже, чем минутная проба.

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

### test/e2e/audit.test.mjs
Регрессионные тесты по находкам аудитов (каждый тест закрывает конкретный баг):
- Молчаливые дропы scheduled на activation-путях (risk/sync-reject → «cancelled» до брокера)
- stopStrategy через deferred-cancel пайплайн (tick #2 = cancelled/user)
- Next-tick retry отвергнутого открытия/размещения (откат `_lastSignalTimestamp`, interval "1h")
- Order-check ping для scheduled (`type: "schedule"`), `listenCheck` как гейт
- Partial-close математика (remaining cost basis, точные доллары)

### test/e2e/gauntlet.test.mjs
Сложные интеграционные тесты ClientStrategy — несколько механизмов через общее состояние:
- **#1**: Полный цикл scheduled с отказом на каждом гейте (placement-reject → retry → sync-reject активации → ТЕРМИНАЛЬНАЯ отмена → новый час → повторный цикл до opened); строгая последовательность из 7 tick-действий
- **#2**: Гонка stopStrategy ВНУТРИ активационного гейта → ровно одно «cancelled» на обоих каналах (дедуп через затирание `_cancelledSignal` в setScheduledSignal)
- **#3**: Backtest переживает risk-reject на wick-активации (cancelled/user без фатала) и доводит следующий сигнал до time_expired
- **#4**: Отказ active order-check закрывает «closed» и полностью освобождает состояние (следующий tick открывает свежий сигнал)
- **#5**: Каскад risk-reject → sync-reject → успех на трёх соседних tick внутри одного "1h"-интервала

### test/e2e/broker.test.mjs
Тесты Broker-адаптера (роутинг сабжектов → IBroker):
- **#1**: Все 8 этапов жизненного цикла scheduled→активация→TP доходят до СВОИХ методов адаптера в строгом порядке, один signalId
- **#2**: Адаптер как гейт: throw в `onSignalOpenCommit`/`onOrderCheck` (размещение отвергнуто + отмена с уведомлением `onSignalScheduleCancelled`)
- **#3**: Backtest-тишина: 0 вызовов адаптера за полный прогон (`for await Backtest.run`)
- **#4**: `enable()` без адаптера бросает; после `disable()` роутинг отключён, фреймворк работает

### test/e2e/strategy.test.mjs
Матрица deferred-команд ClientStrategy: Live (манки-паттерн `runTick` + Broker) × Backtest (команды из коллбеков стратегии, `for await Backtest.run`):
- **LIVE #1**: `createSignal` — DTO из очереди потребляется вместо getSignal (broker openCommit "active" + pendingOpen); busy-guard бросает при живой позиции
- **LIVE #2**: `closePending` — sync-close гейт отвергает первую попытку, `_closedSignal` сохраняется и закрытие ретраится на следующем tick (closeId в результате)
- **LIVE #3**: `activateScheduled` — вход по `priceOpen` (цена филла лимитника), commit "activate-scheduled" с activateId, broker уведомлён
- **LIVE #4**: `cancelScheduled` — cancelled/user с cancelId, commit с note, broker `onSignalScheduleCancelled`
- **LIVE #5**: `createTakeProfit`/`createStopLoss` — закрытие ПО ЭФФЕКТИВНОМУ уровню TP/SL минуя VWAP (рынок не двигался)
- **BACKTEST #1**: `cancelScheduled` из `onSchedulePing` — свечной цикл дренит отмену mid-frame (cancelId)
- **BACKTEST #2**: `activateScheduled` из `onSchedulePing` — inline-открытие без касания priceOpen, базис = priceOpen, доживает до time_expired
- **BACKTEST #3**: `createTakeProfit` из `onActivePing` — закрытие по эффективному TP при VWAP на месте (closeId)
- **BACKTEST #4**: `closePending` из `onActivePing` — closed/"closed" mid-frame (closeId)
- **BACKTEST #5**: манки-патч `onOrderSync` — order-гейты наблюдаемы и гейтят в backtest (полный цикл signal-open/schedule ×2 → active → close)
- **LIVE #6**: check закрывает позицию на ПЯТОЙ проверке после активации (scheduled → opened → active×4 с успешными check'ами → closed/"closed"; счёт schedule/active check'ов точный)

### test/e2e/manage.test.mjs
Позиционные команды из `listenActivePing` (продакшн-паттерн императивного менеджмента по live-тику; схема всех тестов: tick #1 открывает → ping тика #2 подаёт команду → tick #3 показывает эффект):
- **trailingStop**: shift −5пп (SL 10% → 5%) — закрытие stop_loss ровно по подтянутому 47500, оригинальный 45000 не тронут ценой; commit "trailing-stop"
- **trailingTake**: shift −10пп (TP 20% → 10%) — take_profit по 55000 при рынке 56000 (< оригинального 60000); ассерт с fp-допуском
- **breakeven**: SL → эффективный вход, закрытие ровно по 50000 (zero-risk exit); commit "breakeven"
- **averageBuy**: DCA $100 на 48000 — эффективная цена = cost-weighted harmonic 200/(100/50000+100/48000), invested $200; commit "average-buy"
- **partialProfit(40%)**: остаток $60, `_partial` типа "profit", commit дренится следующим tick
- **partialLoss(30%)**: остаток $70, тип "loss", commit "partial-loss"
- **Переплетение DCA × партиалы**: open $100 → DCA $100 → profit 50% → DCA $100 → loss 25% → profit 100% остатка; строгие снапшоты `costBasisAtClose` [200, 200, 150] / `entryCountAtClose` [2, 3, 3], invested $300, остаток ровно $0 (партиал #2 берёт базис «остаток после 50% + вход, добавленный ПОСЛЕ партиала»; финальный 100% проходит через epsilon-кап)

ВАЖНО: `percentShift` у trailing-команд — сдвиг дистанции в процентных ПУНКТАХ
(SL 10% + shift −5 → 5%), а не доля от дистанции.

### test/e2e/recovery.test.mjs
Матрица crash-recovery deferred-состояния (useJson-адаптеры локально, «крэш» = голый dispose через clear, сброс остатков прошлых прогонов null-записями):
- **stopStrategy-отмена** переживает крэш: cancelled/user + `onSignalScheduleCancelled` в Broker-адаптер ПОСЛЕ рестарта
- **activateScheduled**: рестарт → opened по priceOpen с commit activate-scheduled (activateId)
- **createTakeProfit**: рестарт → closed take_profit по эффективному TP с closeId
- **createSignal**: DTO из очереди переживает крэш и открывается (ВАЖНО: createSignal требует посеянной цены — сначала один tick)
- **commit-очередь по pendingSignalId**: застрявший partial-profit commit дренится после рестарта, состояние партиала восстановлено
- **Осиротевшая очередь НЕ реплеится** (at-most-once через рестарт): partial-commit + TP-филл занулил pending → после крэша commit дропнут, филл закрыл позицию

### test/e2e/short.test.mjs
SHORT-зеркало новой логики (вся сессия писалась на long):
- **Гейты жизненного цикла**: placement reject/retry, активация на РОСТЕ цены, opened по priceOpen (fp-допуск: effective через 100/(100/60000))
- **trailingStop**: SL ВЫШЕ входа подтягивается ВНИЗ (10% → 5% = 52500), закрытие на росте по подтянутому уровню
- **DCA-вверх × партиалы × breakeven**: усреднение при росте (52000 > max entry), harmonic effective ≈50980.39, снапшоты [200, 120], breakeven вниз → выход ровно по effective

### test/e2e/commit.test.mjs
Императивный commit*-слой (function/strategy.ts → Broker-адаптер напрямую, НЕ подписки):
- **Роутинг**: commitTrailingStop/commitAverageBuy/commitPartialProfit/commitBreakeven из listenActivePing (контексты наследуются от tick) → свои методы адаптера, один signalId, операции применяются (remaining $160). ВАЖНО: `commitTrailingStop(symbol, shift, currentPrice)` — третий аргумент обязателен
- **Тишина без enable()**: commit* исполняются молча (skip, не throw), адаптер не вызывается

### test/e2e/hardening.test.mjs
Дозакрытие пробелов:
- **`callbacks.onOrderSync` в Action** — второй санкционированный гейт-канал: throw → откат троттла → next-tick retry в "1h"
- **Таймаут getSignal** (`CC_MAX_SIGNAL_GENERATION_SECONDS` через частичный setConfig): зависший getSignal обрывается за ~1с → idle
- **Одноразовость listenSyncOnce/listenCheckOnce**: ровно 1 срабатывание на два цикла событий
- **Infinity-холд через крэш**: JSON null → Infinity restore, позиция active сутки спустя, estimate === Infinity (нужен `CC_MAX_SIGNAL_LIFETIME_MINUTES: Infinity`)
- **Whipsaw через рестарт**: `_lastPendingId` восстановлен из PersistRecentAdapter (Recent записан напрямую адаптером — канал Recent-класса в тестах не активен), детерминированный id заблокирован ПОСЛЕ вызова getSignal
- **Конкуренция за общую риск-мапу**: shared riskName + validation по `activePositionCount` — A занимает слот → B idle → A закрылась → B opened (release-точки реально возвращают слот)
- **stopStrategy на PLACEMENT-гейте**: отказ размещения при стопе не оставляет фантомов — ни schedule-событий (ордер не размещался), reserve/remove ровно по 1, getSignal замолкает
- **Статистика отмен по новому пути** (BACKTEST): risk-reject wick-активации попадает в cancellationRate (50/50 на 2 сигналах) благодаря cancelled-outcome фиксу. НЮАНС: активация должна быть ПОЗЖЕ свечи создания scheduled, иначе pendingAt === scheduledAt и сервис (signalEmitter-based) не матчит; в LIVE отказ активации даёт idle-тик и в rate не попадает — задокументированное ограничение

### test/e2e/short.test.mjs (дополнение)
- **Backtest wick-активация short**: вик ВВЕРХ пробивает priceOpen, risk-reject первой активации → cancelled/user без фатала, второй short доживает до time_expired

### test/e2e/coverage.test.mjs
Тесты на изменения `git diff master -- src/client/ClientStrategy.ts`, не покрытые остальными файлами (каждый тест привязан к ханку дифа):
- **Epsilon партиалов** (`PARTIAL_CAP_TOLERANCE_FACTOR`): 30% → 50% → 100%-от-остатка проходят все, остаток ровно 0
- **Risk-release при timeout-отмене scheduled** (`CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN`): патч `strategy.params.risk.removeSignal` — ровно 1 вызов
- **Risk-release при SL-отмене до активации** (`CANCEL_SCHEDULED_SIGNAL_BY_STOPLOSS_FN`): то же для price_reject
- **Release утёкшей резервации при validate-throw** (fallback `GET_SIGNAL_FN`): невалидный DTO после успешного reserve → remove ×1
- **`GET_PROGRESS_PERCENT_FN`**: breakeven ставит SL = entry, отвергнутое sync-закрытие проваливается в мониторинг → percentSl = 100 (не Infinity/NaN)
- **Drop очереди коммитов без pending** (`PROCESS_COMMIT_QUEUE_FN`): partial-commit в очереди + TP-филл занулил pending → commit дропнут (не эмитится), close-pending доставлен
- **Cost-fallback** (`signal.cost ?? CC_POSITION_ENTRY_COST`): сигнал с cost=250 и пустым `_entry` (патч state) → invested/entries отдают 250, не $100
- **Crash-recovery deferred close** (`WAIT_FOR_INIT_FN` + `PERSIST_STRATEGY_FN` + `getStatus`): closePending → dispose инстанса ГОЛЫМ clear() → restore → дренаж closed/"closed" с closeId; useJson-адаптеры локально в скоупе теста
- **Контекстно-независимая поверхность**: 62 ГОЛЫХ вызова (без method/execution контекстов) по всей поверхности инстанса — все геттеры, validate*, позиционные команды (partial/trailing/breakeven/DCA), deferred-команды, setScheduledSignal, waitForInit (пустой restore), stopStrategy, dispose; упавший метод называется по имени. Вне инварианта (законно контекстные): tick, backtest, setPendingSignal (`when` для onWrite), restore-ветки waitForInit

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

## Buffer Candles для VWAP расчета

**КРИТИЧНО**: ClientStrategy.ts требует 4 буферные свечи ПЕРЕД startTime для корректного расчета VWAP.

### Почему нужны буферные свечи

**Проблема**: VWAP (Volume Weighted Average Price) рассчитывается по последним 4 свечам. Если тест генерирует свечи начиная с `startTime`, первые 4 свечи будут пропущены буферной логикой.

```typescript
// Из ClientStrategy.ts (строки 1355-1359, 1456-1460)
const bufferCandlesCount = 4;

for (let i = 0; i < candles.length; i++) {
  if (i < bufferCandlesCount) {
    continue;  // Пропускаем первые 4 свечи
  }
  // Обработка свечи...
}
```

**Последствия**:
1. Система пропускает первые 4 свечи после `startTime`
2. VWAP рассчитывается неправильно, если нет предшествующих свечей
3. Immediate сигналы (`priceOpen = basePrice`) становятся scheduled
4. Partial profit/loss события не срабатывают (работают только для opened сигналов)

### Решение: Буферный паттерн

**Шаг 1**: Добавьте `bufferStartTime` ДО `startTime`:

```javascript
const startTime = new Date("2024-01-01T00:00:00Z").getTime();
const intervalMs = 60000; // 1 минута
const bufferMinutes = 4;
const bufferStartTime = startTime - bufferMinutes * intervalMs;

// bufferStartTime = startTime - 4 минуты
// Буферные свечи: [bufferStartTime, bufferStartTime+1m, bufferStartTime+2m, bufferStartTime+3m]
// Основные свечи: [startTime, startTime+1m, ...]
```

**Шаг 2**: Обновите `getCandles` для использования `bufferStartTime`:

```javascript
addExchange({
  exchangeName: "test-exchange",
  getCandles: async (_symbol, _interval, since, limit) => {
    // КРИТИЧНО: Считаем индекс от bufferStartTime, не от startTime!
    const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
    const result = allCandles.slice(sinceIndex, sinceIndex + limit);
    return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
  }
});
```

**Шаг 3**: Предзаполните минимум 5 свечей ДО `addExchange`:

```javascript
let allCandles = [];

// Предзаполняем минимум 5 свечей для getAveragePrice
for (let i = 0; i < 5; i++) {
  allCandles.push({
    timestamp: bufferStartTime + i * intervalMs,
    open: basePrice,
    high: basePrice + 100,
    low: basePrice - 50,
    close: basePrice,
    volume: 100,
  });
}
```

**Шаг 4**: Генерируйте буферные свечи в `getSignal`:

```javascript
addStrategy({
  strategyName: "test-strategy",
  interval: "1m",
  getSignal: async () => {
    if (index === 1) {
      allCandles = [];

      // КРИТИЧНО: Буферные свечи (4 минуты ДО startTime)
      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      // Генерируем основные свечи (начиная с startTime)
      for (let i = 0; i < candlesCount; i++) {
        const timestamp = startTime + i * intervalMs;
        allCandles.push({
          timestamp,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }
    }

    return {
      position: "long",
      priceOpen: basePrice,  // VWAP = basePrice → immediate activation
      priceTakeProfit: basePrice + 1000,
      priceStopLoss: basePrice - 1000,
      minuteEstimatedTime: 120,
    };
  }
});
```

### Полный пример теста с буферными свечами

```javascript
import { test } from "worker-testbed";
import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenDoneBacktest,
  listenPartialProfit,
} from "../../build/index.mjs";
import { Subject } from "functools-kit";

test("Partial profit with buffer candles", async ({ pass, fail }) => {
  const profitEvents = [];

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 100000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];
  let signalGenerated = false;

  // Предзаполняем минимум 5 свечей
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "test-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, q) => q.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      allCandles = [];

      // Буферные свечи (4 минуты ДО startTime)
      for (let i = 0; i < bufferMinutes; i++) {
        allCandles.push({
          timestamp: bufferStartTime + i * intervalMs,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }

      // Основные свечи (начиная с startTime)
      for (let i = 0; i < 50; i++) {
        const timestamp = startTime + i * intervalMs;

        if (i < 5) {
          // Активация: цена = basePrice (VWAP = basePrice → immediate)
          allCandles.push({
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        } else if (i >= 5 && i < 15) {
          // Рост до +12% (вызовет partial 10%)
          const price = basePrice + 12000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        } else {
          // Достигаем TP
          const price = basePrice + 60000;
          allCandles.push({
            timestamp,
            open: price,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: 100,
          });
        }
      }

      return {
        position: "long",
        priceOpen: basePrice,  // VWAP = basePrice → immediate activation
        priceTakeProfit: basePrice + 60000,
        priceStopLoss: basePrice - 50000,
        minuteEstimatedTime: 120,
      };
    },
  });

  addFrame({
    frameName: "50m-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:50:00Z"),
  });

  const unsubscribeProfit = listenPartialProfit(({ level }) => {
    profitEvents.push(level);
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy",
    exchangeName: "test-exchange",
    frameName: "50m-test",
  });

  await awaitSubject.toPromise();
  unsubscribeProfit();

  if (profitEvents.length < 1) {
    fail(`Expected at least 1 partial profit event, got ${profitEvents.length}`);
    return;
  }

  pass(`Partial profit WORKS: [${profitEvents.join('%, ')}%] with buffer candles`);
});
```

### Когда НЕ нужны буферные свечи

Буферные свечи НЕ требуются если:

1. **Вы используете scheduled сигналы** (не immediate):
   ```javascript
   // priceOpen ниже текущей цены → scheduled (не immediate)
   const currentPrice = basePrice; // 100000
   return {
     position: "long",
     priceOpen: currentPrice - 500,  // 99500 < 100000 → scheduled
     priceTakeProfit: currentPrice + 1000,
     priceStopLoss: currentPrice - 1500,
   };
   ```

2. **Тест НЕ проверяет partial profit/loss**:
   - Partial события работают только для opened сигналов
   - Scheduled сигналы не генерируют partial события

3. **Вы НЕ используете `getAveragePrice()`**:
   ```javascript
   const basePrice = 100000;  // Константа

   return {
     priceOpen: basePrice,  // Не вызываем getAveragePrice
     priceTakeProfit: basePrice + 1000,
     priceStopLoss: basePrice - 1000,
   };
   ```

### Типичные ошибки без буферных свечей

**Ошибка #1**: "Expected at least N partial events, got 0"

```javascript
// ❌ НЕПРАВИЛЬНО: нет буферных свечей
const startTime = new Date("2024-01-01T00:00:00Z").getTime();
const intervalMs = 60000;
const basePrice = 100000;

let allCandles = [];

addExchange({
  getCandles: async (_symbol, _interval, since, limit) => {
    const sinceIndex = Math.floor((since.getTime() - startTime) / intervalMs);
    return allCandles.slice(sinceIndex, sinceIndex + limit);
  }
});

addStrategy({
  getSignal: async () => {
    allCandles = [];

    // Генерируем свечи с startTime (БЕЗ буфера)
    for (let i = 0; i < 50; i++) {
      allCandles.push({
        timestamp: startTime + i * intervalMs,
        open: basePrice,
        high: basePrice + 100,
        low: basePrice - 100,
        close: basePrice,
        volume: 100,
      });
    }

    return {
      position: "long",
      priceOpen: basePrice,  // Ожидаем immediate, но VWAP отличается!
      priceTakeProfit: basePrice + 60000,
      priceStopLoss: basePrice - 50000,
    };
  }
});

// Результат: VWAP ≠ basePrice → сигнал становится scheduled → partial не срабатывает
```

**Причина**: Без буферных свечей VWAP рассчитывается по свечам начиная с `startTime`. Первые 4 свечи пропускаются, VWAP отличается от `basePrice`, сигнал становится scheduled вместо immediate.

**Решение**: Добавьте 4 буферные свечи ДО `startTime`:

```javascript
// ✅ ПРАВИЛЬНО: добавляем буферные свечи
const bufferMinutes = 4;
const bufferStartTime = startTime - bufferMinutes * intervalMs;

addExchange({
  getCandles: async (_symbol, _interval, since, limit) => {
    const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
    return allCandles.slice(sinceIndex, sinceIndex + limit);
  }
});

addStrategy({
  getSignal: async () => {
    allCandles = [];

    // Буферные свечи
    for (let i = 0; i < bufferMinutes; i++) {
      allCandles.push({
        timestamp: bufferStartTime + i * intervalMs,
        open: basePrice,
        high: basePrice + 50,
        low: basePrice - 50,
        close: basePrice,
        volume: 100,
      });
    }

    // Основные свечи
    for (let i = 0; i < 50; i++) {
      allCandles.push({
        timestamp: startTime + i * intervalMs,
        open: basePrice,
        high: basePrice + 100,
        low: basePrice - 100,
        close: basePrice,
        volume: 100,
      });
    }

    return {
      position: "long",
      priceOpen: basePrice,  // VWAP = basePrice → immediate activation ✓
      priceTakeProfit: basePrice + 60000,
      priceStopLoss: basePrice - 50000,
    };
  }
});

// Результат: VWAP = basePrice → immediate activation → partial события срабатывают ✓
```

**Ошибка #2**: "no candles data for symbol=BTCUSDT"

```javascript
// ❌ НЕПРАВИЛЬНО: allCandles пуст при первом вызове getAveragePrice
let allCandles = [];

addExchange({
  getCandles: async () => allCandles  // Пустой массив!
});

addStrategy({
  getSignal: async () => {
    const price = await getAveragePrice("BTCUSDT");  // ❌ Ошибка!
    return { priceOpen: price, ... };
  }
});
```

**Решение**: Предзаполните минимум 5 свечей ДО `addExchange`:

```javascript
// ✅ ПРАВИЛЬНО: предзаполняем свечи
const bufferMinutes = 4;
const bufferStartTime = startTime - bufferMinutes * intervalMs;
let allCandles = [];

for (let i = 0; i < 5; i++) {
  allCandles.push({
    timestamp: bufferStartTime + i * intervalMs,
    open: basePrice,
    high: basePrice + 100,
    low: basePrice - 50,
    close: basePrice,
    volume: 100,
  });
}

addExchange({
  getCandles: async () => allCandles  // Уже есть 5 свечей ✓
});
```

### См. также

- [test/e2e/partial.test.mjs](./e2e/partial.test.mjs) - Все 10 тестов используют буферный паттерн
- [test/e2e/levels.test.mjs](./e2e/levels.test.mjs) - Все 4 теста используют буферный паттерн
- [test/e2e/scheduled.test.mjs](./e2e/scheduled.test.mjs) - Тесты #1 и #3 с буферными свечами
- [test/e2e/timing.test.mjs](./e2e/timing.test.mjs) - Тесты #46 и #48 с буферными свечами

---

## Immediate Activation Feature

**НОВАЯ ФУНКЦИОНАЛЬНОСТЬ**: С версии, включающей immediate activation, система автоматически открывает позиции когда priceOpen уже находится в зоне активации.

### Логика immediate activation

#### LONG позиции
```typescript
// LONG = покупаем дешевле
// Если currentPrice (VWAP) <= priceOpen → открываем СРАЗУ
if (signal.position === "long" && currentPrice <= signal.priceOpen) {
  // Немедленная активация - БЕЗ scheduled фазы
  return immediateSignal;
}
```

**Пример**:
```javascript
// currentPrice (VWAP) = 42000
// priceOpen = 43000

// ДО immediate activation:
// → scheduled (ждем падения до 43000)

// ПОСЛЕ immediate activation:
// → opened сразу (цена уже ниже 43000!)
```

#### SHORT позиции
```typescript
// SHORT = продаем дороже
// Если currentPrice (VWAP) >= priceOpen → открываем СРАЗУ
if (signal.position === "short" && currentPrice >= signal.priceOpen) {
  // Немедленная активация - БЕЗ scheduled фазы
  return immediateSignal;
}
```

**Пример**:
```javascript
// currentPrice (VWAP) = 43000
// priceOpen = 42000

// ДО immediate activation:
// → scheduled (ждем роста до 42000)

// ПОСЛЕ immediate activation:
// → opened сразу (цена уже выше 42000!)
```

### Влияние на тесты

**КРИТИЧНО**: Immediate activation использует **VWAP** (Volume Weighted Average Price), а НЕ low/high свечей!

```javascript
// ❌ НЕПРАВИЛЬНОЕ ОЖИДАНИЕ
// Думаем: candle.low > priceOpen → сигнал scheduled
// Реальность: VWAP может быть <= priceOpen → immediate activation!

const candles = [
  { low: 42100, high: 42500, close: 42200, volume: 100 }, // VWAP ≈ 42200
  { low: 42100, high: 42500, close: 42200, volume: 100 },
];
// priceOpen = 42500
// VWAP = 42200 < 42500 → IMMEDIATE ACTIVATION для LONG!
```

**Решение**: Убедитесь что VWAP **ВЫШЕ** priceOpen для LONG (или **НИЖЕ** для SHORT):

```javascript
// ✅ ПРАВИЛЬНО для scheduled LONG
const candles = [
  { open: 43000, high: 43100, low: 42900, close: 43000, volume: 100 }, // VWAP ≈ 43000
  { open: 43000, high: 43100, low: 42900, close: 43000, volume: 100 },
];
// priceOpen = 42500
// VWAP = 43000 > 42500 → SCHEDULED (ждем падения)
```

### Валидация для immediate сигналов

**НОВАЯ ВАЛИДАЦИЯ**: Immediate сигналы проверяются СТРОЖЕ чем scheduled!

```typescript
// Для immediate сигналов (isScheduled = false):
if (!isScheduled) {
  // LONG: текущая цена не должна быть НИЖЕ StopLoss
  if (currentPrice < signal.priceStopLoss) {
    throw new Error("Signal would be immediately cancelled");
  }

  // LONG: текущая цена не должна быть ВЫШЕ TakeProfit
  if (currentPrice > signal.priceTakeProfit) {
    throw new Error("Profit opportunity has already passed");
  }
}
```

**Пример проблемы**:
```javascript
// Сигнал #1 закрылся по SL на уровне 93500
// VWAP остался на 93300

// Сигнал #2 генерируется:
// priceStopLoss = 94500
// currentPrice (VWAP) = 93300

// ❌ ОШИБКА: currentPrice (93300) < priceStopLoss (94500)
// Сигнал отклонен валидацией!
```

**Решение**: Добавьте восстановление цены между сигналами:

```javascript
// После SL на минуте 40:
allCandles.push({ open: 93000, close: 93000, ... }); // SL

// Восстановление цены (минуты 41-45):
for (let i = 41; i < 46; i++) {
  allCandles.push({
    open: 95000,  // Вернулись к basePrice
    close: 95000,
    low: 94900,
    high: 95100,
    volume: 100
  });
}

// Теперь VWAP поднялся, следующий сигнал пройдет валидацию
```

### Паттерны для тестов с immediate activation

#### Паттерн #1: Гарантированный scheduled сигнал

Чтобы ГАРАНТИРОВАТЬ scheduled состояние для LONG:

```javascript
const basePrice = 95000;
const priceOpen = basePrice - 500; // 94500

// Все свечи ВЫШЕ priceOpen → VWAP выше priceOpen
allCandles.push({
  open: basePrice,      // 95000
  high: basePrice + 100,
  low: basePrice - 50,  // 94950 > priceOpen ✓
  close: basePrice,
  volume: 100
});

// VWAP ≈ 95000 > 94500 (priceOpen) → SCHEDULED
```

Для SHORT:

```javascript
const basePrice = 95000;
const priceOpen = basePrice + 500; // 95500

// Все свечи НИЖЕ priceOpen → VWAP ниже priceOpen
allCandles.push({
  open: basePrice,      // 95000
  high: basePrice + 100, // 95100 < priceOpen ✓
  low: basePrice - 50,
  close: basePrice,
  volume: 100
});

// VWAP ≈ 95000 < 95500 (priceOpen) → SCHEDULED
```

#### Паттерн #2: Намеренный immediate activation

Для тестирования immediate activation:

```javascript
const currentPrice = 42000;
const priceOpen = 43000; // ВЫШЕ currentPrice

// LONG: priceOpen > currentPrice → immediate activation
addStrategy({
  getSignal: async () => ({
    position: "long",
    priceOpen: 43000,        // Выше текущей
    priceTakeProfit: 44000,
    priceStopLoss: 41000,    // Ниже currentPrice ✓
  })
});

// Результат: opened СРАЗУ, БЕЗ scheduled фазы
```

#### Паттерн #3: Восстановление после SL/TP

После сигнала с SL всегда добавляйте восстановление:

```javascript
// Сигнал #1: SL (минуты 35-40)
if (i >= 35 && i < 40) {
  allCandles.push({
    open: priceOpen - 1000,  // Пробили SL
    close: priceOpen - 1000,
    low: priceOpen - 1100,
    high: priceOpen - 900,
    volume: 100
  });
}

// КРИТИЧНО: Восстановление цены (минуты 40-45)
else if (i >= 40 && i < 45) {
  allCandles.push({
    open: basePrice,         // Вернулись к норме
    close: basePrice,
    low: basePrice - 50,
    high: basePrice + 100,
    volume: 100
  });
}

// Теперь можно безопасно создать сигнал #2
```

### Обновление ожиданий в тестах

**ВАЖНО**: С immediate activation количество scheduled/opened сигналов может измениться!

```javascript
// ❌ Старый тест (до immediate activation):
if (scheduledCount !== 5) {
  fail(`Expected 5 scheduled, got ${scheduledCount}`);
}

// ✅ Новый тест (с immediate activation):
if (scheduledCount < 3) {
  fail(`Expected at least 3 scheduled, got ${scheduledCount}`);
}
```

**Почему**: Некоторые сигналы могут активироваться немедленно если VWAP в зоне активации.

### Типичные ошибки после immediate activation

#### Ошибка #1: Валидация отклоняет сигнал

```
Error: Long: currentPrice (93300) < priceStopLoss (93500)
```

**Причина**: VWAP остался низким после предыдущего SL.

**Решение**: Добавьте восстановление цены между сигналами.

#### Ошибка #2: Ожидали scheduled, получили opened

```
Expected signal to be scheduled, but it opened immediately
```

**Причина**: VWAP попал в зону активации (VWAP <= priceOpen для LONG).

**Решение**: Поднимите цены свечей чтобы VWAP был ВЫШЕ priceOpen.

#### Ошибка #3: writeValue() вызван для scheduled

```
CRITICAL BUG: writeValue() called for scheduled signal!
```

**Причина**: Сигнал активировался немедленно вместо scheduled из-за VWAP.

**Решение**: Проверьте что `low > priceOpen` для LONG (или `high < priceOpen` для SHORT) И что VWAP тоже выше/ниже priceOpen.

### Дебаг immediate activation проблем

Добавьте console.log для отладки:

```javascript
const basePrice = 43000;
const priceOpen = basePrice + 1000; // 44000

allCandles.push({
  open: basePrice + 1500,  // 44500
  high: basePrice + 1600,  // 44600
  low: basePrice + 1100,   // 44100
  close: basePrice + 1500, // 44500
  volume: 100
});

console.log(`VWAP calculation:`);
console.log(`  Candle: low=${basePrice + 1100}, high=${basePrice + 1600}`);
console.log(`  priceOpen=${priceOpen}`);
console.log(`  Expected VWAP ≈ ${(basePrice + 1500 + basePrice + 1600 + basePrice + 1100 + basePrice + 1500) / 4}`);
console.log(`  shouldActivate for LONG: VWAP <= priceOpen?`);
```

## Полный пример комплексного теста

См. [test/e2e/sequence.test.mjs](./e2e/sequence.test.mjs) для примера теста с:
- Предгенерацией свечей
- Множественными сигналами
- Обработкой ошибок
- Минимальными ожиданиями
- Подробными проверками
- Восстановлением цены после SL
- Учетом immediate activation

## Trailing Stop Feature

**НОВАЯ ФУНКЦИОНАЛЬНОСТЬ**: Trailing Stop позволяет динамически изменять StopLoss во время работы opened сигнала.

### Основные концепции

#### Принцип работы

Trailing Stop работает **относительно entry price**, а НЕ относительно текущей цены:

```typescript
// Текущий SL distance (от entry): 2%
// percentShift = -0.5% (отрицательный = подтягиваем SL)
// Новый SL distance: 2% + (-0.5%) = 1.5%

// LONG пример:
// entry = 100, originalSL = 98 (distance = 2%)
// Trailing: percentShift = -0.5%
// newSL = 100 - (100 * 0.015) = 98.5 (distance = 1.5%)
```

**Важно**:
- **Отрицательный shift** = подтягивание SL (уменьшение distance, защита прибыли)
- **Положительный shift** = ослабление SL (увеличение distance, больше свободы цене)

### API методы

#### 1. Функциональный API (в стратегиях)

```typescript
import { trailingStop } from "backtest-kit";

// В callbacks стратегии
await trailingStop(symbol, percentShift);
```

**Автоматически определяет режим** (backtest/live) из контекста выполнения.

#### 2. Class API для Backtest

```typescript
import { Backtest } from "backtest-kit";

await Backtest.trailingStop(symbol, percentShift, {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1h-frame"
});
```

#### 3. Class API для Live

```typescript
import { Live } from "backtest-kit";

await Live.trailingStop(symbol, percentShift, {
  strategyName: "my-strategy",
  exchangeName: "binance"
});
```

### Интеграция с Partial Events

#### Паттерн #1: onPartialProfit callback

```javascript
addStrategy({
  strategyName: "trailing-strategy",
  getSignal: async () => ({ ... }),
  callbacks: {
    onPartialProfit: async (symbol, signal, currentPrice, revenuePercent, backtest) => {
      // revenuePercent - прогресс к TP (0-100%)
      // Для LONG: (currentPrice - entry) / (TP - entry) * 100

      // Применяем trailing stop на определенных уровнях
      const level = Math.round(revenuePercent / 10) * 10;

      if (level === 10) {
        await trailingStop(symbol, -0.5); // Подтягиваем SL на 10% прибыли
      } else if (level === 20) {
        await trailingStop(symbol, -0.5); // Еще подтягиваем на 20%
      }
    }
  }
});
```

#### Паттерн #2: listenPartialProfit глобальный слушатель

```javascript
import { listenPartialProfit, trailingStop } from "backtest-kit";

const unsubscribe = listenPartialProfit(async ({ symbol, level, data, currentPrice }) => {
  // level - округленный процент (10, 20, 30, ...)
  // data - IPublicSignal

  if (level === 20) {
    await trailingStop(symbol, -0.5);
  }
});
```

#### Паттерн #3: listenPartialLoss для защиты убытков

```javascript
import { listenPartialLoss, trailingStop } from "backtest-kit";

const unsubscribe = listenPartialLoss(async ({ symbol, level, data, currentPrice }) => {
  // Подтягиваем SL вверх даже при убытках (cut losses faster)

  if (level === 10) {
    await trailingStop(symbol, -0.5); // Уменьшаем расстояние до SL
  }
});
```

### Валидация и безопасность

#### Проверки системы

1. **Новый SL не может пересечь entry**:
   ```typescript
   // LONG: newSL >= entry → отклонено
   // SHORT: newSL <= entry → отклонено
   ```

2. **Только улучшение SL**:
   ```typescript
   // LONG: newSL должен быть ВЫШЕ currentSL
   // SHORT: newSL должен быть НИЖЕ currentSL
   ```

3. **Требуется opened сигнал**:
   - Trailing stop работает ТОЛЬКО для opened сигналов
   - Scheduled сигналы не поддерживают trailing stop

### Примеры тестов

#### Тест #1: Базовый trailing stop

```javascript
test("TRAILING STOP: Tightens SL for LONG position", async ({ pass, fail }) => {
  addStrategy({
    getSignal: async () => ({
      position: "long",
      priceOpen: 100,
      priceTakeProfit: 110,
      priceStopLoss: 98,  // Original SL: -2%
      minuteEstimatedTime: 60,
    }),
    callbacks: {
      onOpen: async (symbol) => {
        // После открытия применяем trailing stop
        await trailingStop(symbol, -0.5); // Shift = -0.5%
        // newSL = 100 - (100 * 0.015) = 98.5
      }
    }
  });

  // Генерируем свечи с падением к новому SL (98.5)
  // ...

  // Проверяем: closeReason = "stop_loss", close price ≈ 98.5
});
```

#### Тест #2: Множественные adjustments

```javascript
test("TRAILING STOP: Multiple adjustments on profit", async ({ pass, fail }) => {
  let adjustments = 0;

  addStrategy({
    getSignal: async () => ({
      position: "long",
      priceOpen: 100,
      priceTakeProfit: 160,
      priceStopLoss: 97.8,
      minuteEstimatedTime: 200,
    }),
    callbacks: {
      onPartialProfit: async (symbol, signal, currentPrice, revenuePercent) => {
        const level = Math.round(revenuePercent / 10) * 10;

        if (level === 10 && adjustments < 1) {
          await trailingStop(symbol, -0.5);
          adjustments++;
        } else if (level === 20 && adjustments < 2) {
          await trailingStop(symbol, -0.5);
          adjustments++;
        } else if (level === 30 && adjustments < 3) {
          await trailingStop(symbol, -0.5);
          adjustments++;
        }
      }
    }
  });

  // ... генерация свечей с ростом до 33% прибыли, затем падение

  // Проверяем: adjustments === 3
});
```

#### Тест #3: Trailing stop с listenPartialLoss

```javascript
test("TRAILING STOP: Apply on loss for faster exit", async ({ pass, fail }) => {
  const adjustments = [];

  const unsubscribe = listenPartialLoss(async ({ symbol, level }) => {
    if (level === 10) {
      await trailingStop(symbol, -0.5);
      adjustments.push(10);
    } else if (level === 20) {
      await trailingStop(symbol, -0.5);
      adjustments.push(20);
    }
  });

  // ... генерация свечей с падением к SL

  // Проверяем: adjustments.length >= 2
  unsubscribe();
});
```

### Типичные проблемы

#### Проблема #1: Trailing stop не применяется

**Причина**: Сигнал в состоянии scheduled, не opened.

**Решение**: Используйте immediate activation или scheduled → opened переход:

```javascript
// Для immediate activation НЕ указывайте priceOpen в сигнале:
return {
  position: "long",
  // priceOpen не указан → система использует currentPrice (VWAP)
  priceTakeProfit: basePrice + 60000,
  priceStopLoss: basePrice - 2200,
};

// Система установит priceOpen = VWAP и откроет immediate если в зоне
```

#### Проблема #2: Partial события не срабатывают

**Причина**: Нет буферных свечей, VWAP рассчитывается неправильно.

**Решение**: Добавьте 4 буферные свечи ДО startTime (см. раздел "Buffer Candles для VWAP расчета").

#### Проблема #3: closeReason = time_expired вместо stop_loss

**Причина**: Недостаточно времени или цена не достигла нового trailing SL.

**Решение**:
- Увеличьте `minuteEstimatedTime`
- Убедитесь что свечи достигают нового SL
- Добавьте фазу падения после adjustments

### Архитектурные изменения

#### Новые файлы и методы

1. **src/function/strategy.ts**:
   - Добавлен метод `trailingStop(symbol, percentShift)`

2. **src/classes/Backtest.ts**:
   - Добавлен метод `Backtest.trailingStop(symbol, percentShift, context)`

3. **src/classes/Live.ts**:
   - Добавлен метод `Live.trailingStop(symbol, percentShift, context)`

4. **src/lib/services/core/StrategyCoreService.ts**:
   - Добавлен метод `trailingStop(backtest, symbol, percentShift, context)`

5. **src/lib/services/connection/StrategyConnectionService.ts**:
   - Добавлен метод `trailingStop(backtest, symbol, percentShift, context)`

6. **src/client/ClientStrategy.ts**:
   - Добавлена функция `TRAILING_STOP_FN(self, signal, percentShift)`
   - Добавлен метод `trailingStop(symbol, percentShift, backtest)`
   - Добавлено внутреннее поле `signal._trailingPriceStopLoss`

#### Изменения в типах

```typescript
interface ISignalRow {
  // ... существующие поля
  _trailingPriceStopLoss?: number;  // Trailing SL если установлен
}
```

### Интеграция с существующей логикой

- При проверке SL система использует `effectiveStopLoss = signal._trailingPriceStopLoss ?? signal.priceStopLoss`
- Partial loss callbacks учитывают trailing SL при расчете progress
- Закрытие по SL использует точную цену trailing SL

### Тестовые файлы

- **test/e2e/trailing.test.mjs**: 6 тестов trailing stop функциональности
  - Тест #1: Базовое подтягивание SL для LONG
  - Тест #2: Отклонение ухудшающего SL
  - Тест #3: Trailing stop для SHORT позиций
  - Тест #4: Интеграция с listenPartialProfit
  - Тест #5: Множественные adjustments на разных уровнях прибыли
  - Тест #6: Применение на partial loss событиях

## Changelog: Immediate Activation Feature

### Изменения в ClientStrategy.ts

1. **Обязательный параметр `isScheduled`** в `VALIDATE_SIGNAL_FN`:
   ```typescript
   const VALIDATE_SIGNAL_FN = (signal: ISignalRow, currentPrice: number, isScheduled: boolean)
   ```

2. **Строгие сравнения** в валидации (`<` и `>` вместо `<=` и `>=`):
   ```typescript
   if (currentPrice < signal.priceStopLoss) // Было: <=
   if (currentPrice > signal.priceTakeProfit) // Было: >=
   ```

3. **Новая валидация для immediate сигналов**:
   - Проверка что currentPrice не пробил SL/TP
   - Только для immediate (isScheduled = false)
   - Scheduled сигналы проверяются при активации

### Обновленные тесты

- **test/e2e/persist.test.mjs**: Ожидание 2 вместо 3 scheduled
- **test/e2e/sequence.test.mjs**: Минимальные ожидания (≥3 вместо 5), восстановление цены
- **test/e2e/sanitize.test.mjs**: Скорректированы ожидания (5 вместо 2, 4 вместо 3)
- **test/e2e/edge.test.mjs**: Гибкие проверки для количества сигналов
- **test/e2e/other.test.mjs**: Новые тесты #9 и #10 для immediate activation
- **test/e2e/trailing.test.mjs**: Все 6 тестов используют immediate activation через отсутствие priceOpen

### См. также

- [test/e2e/other.test.mjs](./e2e/other.test.mjs) - Тесты #9 и #10 демонстрируют immediate activation для LONG и SHORT
- [test/e2e/trailing.test.mjs](./e2e/trailing.test.mjs) - Тесты #5 и #6 демонстрируют trailing stop с immediate activation
