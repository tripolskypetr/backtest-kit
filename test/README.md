# Руководство по тестированию backtest-kit

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

### Типичные ошибки при написании тестов

#### Ошибка #1: Свечи попадают под StopLoss

```javascript
// НЕПРАВИЛЬНО: первая свеча попадает под SL!
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

#### Правильно: Свечи НЕ попадают под StopLoss

```javascript
// ПРАВИЛЬНО: первые свечи выше SL
addExchange({
  getCandles: async (_symbol, _interval, since, limit) => {
    const candles = [];
    for (let i = 0; i < limit; i++) {
      if (i < 5) {
        // Первые 5 свечей: цена ВЫШЕ priceOpen (ждем падения)
        candles.push({
          timestamp: since.getTime() + i * 60000,
          open: 43000,
          high: 43100,
          low: 42900,  // ✅ 42900 > 41000 (SL) → OK!
          close: 43000,
        });
      } else if (i >= 5 && i < 10) {
        // Следующие 5 свечей: цена достигает priceOpen
        candles.push({
          timestamp: since.getTime() + i * 60000,
          open: 42000,
          high: 42100,
          low: 41900,  // ✅ 41900 <= 42000 (priceOpen) → активация!
          close: 42000,  // ✅ 41900 > 41000 (SL) → не отменяется!
        });
      }
    }
    return candles;
  }
});
```

### Полный пример теста базовой торговли

```javascript
test("Basic trading: scheduled → opened → closed", async ({ pass, fail }) => {
  let scheduledResult = null;
  let openedResult = null;
  let closedResult = null;

  addExchange({
    exchangeName: "test-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = since.getTime() + i * 60000;

        if (i < 5) {
          // Фаза 1: Ждем активации (цена выше priceOpen)
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,
            low: 42900,  // Выше SL=41000, выше priceOpen=42000
            close: 43000,
            volume: 100,
          });
        } else if (i >= 5 && i < 10) {
          // Фаза 2: Активация (цена достигает priceOpen)
          candles.push({
            timestamp,
            open: 42000,
            high: 42100,
            low: 41900,  // <= priceOpen=42000 → активация!
            close: 42000,
            volume: 100,
          });
        } else {
          // Фаза 3: Закрытие (цена достигает TP)
          candles.push({
            timestamp,
            open: 43000,
            high: 43100,  // >= TP=43000 → закрытие!
            low: 42900,
            close: 43000,
            volume: 100,
          });
        }
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalGenerated = false;

  addStrategy({
    strategyName: "test-strategy",
    interval: "1m",
    getSignal: async () => {
      if (signalGenerated) return null;
      signalGenerated = true;

      return {
        position: "long",
        priceOpen: 42000,
        priceTakeProfit: 43000,
        priceStopLoss: 41000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: (_symbol, data) => { scheduledResult = data; },
      onOpen: (_symbol, data) => { openedResult = data; },
      onClose: (_symbol, data, priceClose) => { closedResult = { signal: data, priceClose }; },
    },
  });

  addFrame({
    frameName: "test-frame",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let finalResult = null;
  listenSignalBacktest((result) => {
    if (result.action === "closed") {
      finalResult = result;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy",
    exchangeName: "test-exchange",
    frameName: "test-frame",
  });

  await awaitSubject.toPromise();
  await sleep(1000);

  // Проверки
  if (!scheduledResult) {
    fail("Signal was NOT scheduled!");
    return;
  }

  if (!openedResult) {
    fail("Signal was NOT opened!");
    return;
  }

  if (!closedResult || !finalResult) {
    fail("Signal was NOT closed!");
    return;
  }

  if (finalResult.closeReason !== "take_profit") {
    fail(`Expected "take_profit", got "${finalResult.closeReason}"`);
    return;
  }

  pass(`SUCCESS: Signal flow: scheduled → opened → closed by TP. PNL: ${finalResult.pnl.pnlPercentage.toFixed(2)}%`);
});
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
- **Тест #4**: Multiple signals with different results (обработка очереди из 3 сигналов: TP, SL, time_expired)

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
