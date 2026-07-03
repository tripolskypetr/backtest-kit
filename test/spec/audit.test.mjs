import { test } from "worker-testbed";

import {
  roundTicks,
  percentValue,
  percentDiff,
  slPriceToPercentShift,
  slPercentShiftToPrice,
  tpPriceToPercentShift,
  tpPercentShiftToPrice,
  toPlainString,
  PositionSize,
  addSizingSchema,
  MemoryBacktest,
  Backtest,
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  getAggregatedTrades,
  Exchange,
} from "../../build/index.mjs";

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/**
 * AUDIT: roundTicks не должен падать на целочисленных и экспоненциальных tickSize.
 * Раньше Intl.NumberFormat("1000") давал "1,000" без дробной части → split('.')[1].length кидал TypeError.
 */
test("AUDIT roundTicks: integer and exponential tick sizes do not crash", async ({ pass, fail }) => {
  const cases = [
    [123.456789, 1, "123"],
    [123.456789, 10, "123"],
    [123.456789, 25, "123"],
    [123.456789, 1000, "123"],
    [123.456789, 0.1, "123.5"],
    [123.456789, 0.01, "123.46"],
    ["100.12345", 0.001, "100.123"],
    [123.456789, 0.00000001, "123.45678900"],
  ];

  for (const [price, tick, expected] of cases) {
    let result;
    try {
      result = roundTicks(price, tick);
    } catch (error) {
      fail(`roundTicks(${price}, ${tick}) threw: ${error.message}`);
      return;
    }
    if (result !== expected) {
      fail(`roundTicks(${price}, ${tick}) = "${result}", expected "${expected}"`);
      return;
    }
  }

  // tickSize = 1e-9: старый код падал (Intl обрезал до 8 знаков → "0")
  try {
    const result = roundTicks(1.123456789123, 1e-9);
    if (!result.includes(".") || result.split(".")[1].length !== 9) {
      fail(`roundTicks(x, 1e-9) precision mismatch: "${result}"`);
      return;
    }
  } catch (error) {
    fail(`roundTicks(x, 1e-9) threw: ${error.message}`);
    return;
  }

  // Невалидный tickSize должен бросать явную ошибку
  try {
    roundTicks(1, 0);
    fail("roundTicks(1, 0) did not throw");
    return;
  } catch {
    // expected
  }

  pass("roundTicks handles integer, fractional and exponential tick sizes");
});

/**
 * AUDIT: percentValue должен возвращать процент изменения от вчера к сегодня.
 * Раньше формула была инвертирована (yesterday/today - 1) и возвращала долю.
 */
test("AUDIT percentValue: correct direction and percent scale", async ({ pass, fail }) => {
  if (!approx(percentValue(100, 105), 5)) {
    fail(`percentValue(100, 105) = ${percentValue(100, 105)}, expected 5`);
    return;
  }
  if (!approx(percentValue(100, 95), -5)) {
    fail(`percentValue(100, 95) = ${percentValue(100, 95)}, expected -5`);
    return;
  }
  if (!approx(percentValue(50, 100), 100)) {
    fail(`percentValue(50, 100) = ${percentValue(50, 100)}, expected 100`);
    return;
  }
  pass("percentValue returns signed percent change from yesterday to today");
});

/**
 * AUDIT: percentDiff — честные краевые случаи вместо sentinel 100.
 */
test("AUDIT percentDiff: honest edge cases instead of sentinel 100", async ({ pass, fail }) => {
  if (!approx(percentDiff(100, 150), 50)) {
    fail(`percentDiff(100, 150) = ${percentDiff(100, 150)}, expected 50`);
    return;
  }
  if (!approx(percentDiff(150, 100), 50)) {
    fail(`percentDiff(150, 100) = ${percentDiff(150, 100)}, expected 50 (symmetric)`);
    return;
  }
  if (percentDiff(0, 0) !== 0) {
    fail(`percentDiff(0, 0) = ${percentDiff(0, 0)}, expected 0 (identical values)`);
    return;
  }
  if (percentDiff(0, 5) !== Infinity) {
    fail(`percentDiff(0, 5) = ${percentDiff(0, 5)}, expected Infinity`);
    return;
  }
  pass("percentDiff reports 0 for equal values and Infinity for zero-vs-nonzero");
});

/**
 * AUDIT: sl/tpPriceToPercentShift — roundtrip через sl/tpPercentShiftToPrice
 * должен возвращать исходную цену по ОБЕ стороны от entry.
 * Раньше Math.abs зеркалил цену при пересечении entry (SL=105 давал SL=95).
 */
test("AUDIT slPriceToPercentShift/tpPriceToPercentShift: roundtrip on both sides of entry", async ({ pass, fail }) => {
  const entry = 100;

  // LONG SL: originalSL=90; целевые SL по обе стороны entry
  for (const target of [95, 99, 100.5, 105]) {
    const shift = slPriceToPercentShift(target, 90, entry, "long");
    const back = slPercentShiftToPrice(shift, 90, entry, "long");
    if (!approx(back, target, 1e-9)) {
      fail(`LONG SL roundtrip: target=${target}, shift=${shift}, back=${back}`);
      return;
    }
  }

  // SHORT SL: originalSL=110; целевые SL по обе стороны entry
  for (const target of [105, 101, 99.5, 95]) {
    const shift = slPriceToPercentShift(target, 110, entry, "short");
    const back = slPercentShiftToPrice(shift, 110, entry, "short");
    if (!approx(back, target, 1e-9)) {
      fail(`SHORT SL roundtrip: target=${target}, shift=${shift}, back=${back}`);
      return;
    }
  }

  // LONG TP: originalTP=110
  for (const target of [107, 101, 99.5]) {
    const shift = tpPriceToPercentShift(target, 110, entry, "long");
    const back = tpPercentShiftToPrice(shift, 110, entry, "long");
    if (!approx(back, target, 1e-9)) {
      fail(`LONG TP roundtrip: target=${target}, shift=${shift}, back=${back}`);
      return;
    }
  }

  // SHORT TP: originalTP=90
  for (const target of [93, 99, 100.5]) {
    const shift = tpPriceToPercentShift(target, 90, entry, "short");
    const back = tpPercentShiftToPrice(shift, 90, entry, "short");
    if (!approx(back, target, 1e-9)) {
      fail(`SHORT TP roundtrip: target=${target}, shift=${shift}, back=${back}`);
      return;
    }
  }

  // Проверка документированного примера: LONG entry=100, origSL=90, target=95 → -5
  if (!approx(slPriceToPercentShift(95, 90, 100, "long"), -5)) {
    fail(`slPriceToPercentShift(95, 90, 100, "long") != -5`);
    return;
  }

  pass("Price-to-shift helpers roundtrip exactly, including profit-zone targets");
});

/**
 * AUDIT: toPlainString не должен калечить snake_case-идентификаторы.
 */
test("AUDIT toPlainString: snake_case survives, emphasis is stripped", async ({ pass, fail }) => {
  const snake = toPlainString("variable my_var_name stays intact");
  if (!snake.includes("my_var_name")) {
    fail(`snake_case mangled: "${snake}"`);
    return;
  }

  const multi = toPlainString("call get_total_percent_closed and use max_drawdown_price");
  if (!multi.includes("get_total_percent_closed") || !multi.includes("max_drawdown_price")) {
    fail(`multi-underscore identifiers mangled: "${multi}"`);
    return;
  }

  const emphasis = toPlainString("this is _italic_ and __bold__ text");
  if (emphasis.includes("_")) {
    fail(`emphasis markers not stripped: "${emphasis}"`);
    return;
  }
  if (!emphasis.includes("italic") || !emphasis.includes("bold")) {
    fail(`emphasis content lost: "${emphasis}"`);
    return;
  }

  pass("toPlainString keeps snake_case and strips real emphasis");
});

/**
 * AUDIT: minPositionSize не должен пробивать риск-капы
 * (maxPositionPercentage / maxPositionSize применяются последними).
 */
test("AUDIT sizing: minPositionSize cannot exceed maxPositionPercentage cap", async ({ pass, fail }) => {
  addSizingSchema({
    sizingName: "audit-sizing-cap",
    method: "fixed-percentage",
    riskPercentage: 2,
    minPositionSize: 10,
    maxPositionPercentage: 1,
  });

  // accountBalance=10000, priceOpen=100 → cap = 10000 * 1% / 100 = 1
  const quantity = await PositionSize.fixedPercentage(
    "BTCUSDT",
    10000,
    100,
    90,
    { sizingName: "audit-sizing-cap" }
  );

  if (!approx(quantity, 1, 1e-9)) {
    fail(`quantity = ${quantity}, expected 1 (percentage cap must override min floor)`);
    return;
  }

  pass("maxPositionPercentage cap has the final word over minPositionSize");
});

/**
 * AUDIT: BM25-нормализация должна сохранять цифры.
 * Раньше [^\p{L}\s] выбрасывал \p{N} — числовые токены (цены, id, "4h")
 * не индексировались и не находились поиском.
 */
test("AUDIT memory search: numeric tokens are indexed and searchable", async ({ pass, fail }) => {
  const signalId = "audit-bm25-digits";
  const bucketName = "audit-bucket";
  const when = new Date();

  await MemoryBacktest.writeMemory({
    memoryId: "entry-1",
    value: { note: "breakout" },
    signalId,
    bucketName,
    description: "price 42000 breakout",
    when,
  });

  const hits = await MemoryBacktest.searchMemory({
    query: "42000",
    signalId,
    bucketName,
    when,
    settings: { BM25_K1: 1.5, BM25_B: 0.75, BM25_SCORE: 0.01 },
  });

  if (hits.length === 1 && hits[0].memoryId === "entry-1") {
    pass("numeric token found by BM25 search");
    return;
  }

  fail(`expected 1 hit for numeric query, got ${hits.length}`);
});

/**
 * AUDIT: пустой диапазон таймфреймов должен давать понятную ошибку.
 * Раньше timeframes[-1].getTime() кидал TypeError, который уходил в
 * process.exit(-1) с невнятным сообщением.
 */
test("AUDIT frame: future startDate throws a clear empty-range error", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "binance-mock-audit-empty-frame",
    getCandles: async () => [],
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-audit-empty-frame",
    interval: "1m",
    getSignal: async () => null,
  });

  addFrameSchema({
    frameName: "audit-empty-frame",
    interval: "1m",
    startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
  });

  try {
    for await (const _ of Backtest.run("BTCUSDT", {
      strategyName: "test-strategy-audit-empty-frame",
      exchangeName: "binance-mock-audit-empty-frame",
      frameName: "audit-empty-frame",
    })) {
      // Just consume
    }
  } catch (error) {
    if (String(error?.message).includes("empty timeframe range")) {
      pass("empty timeframe range produces a clear error");
      return;
    }
    fail(`unexpected error: ${error?.message}`);
    return;
  }

  fail("Backtest.run on a future-dated frame did not throw");
});

/**
 * AUDIT: getAggregatedTrades с limit не должен зацикливаться, когда у
 * символа нет истории. Раньше пагинация назад шла до эпохи и дальше,
 * бесконечно опрашивая адаптер пустыми окнами.
 */
test("AUDIT getAggregatedTrades: empty history terminates with partial result", async ({ pass, fail }) => {
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000;
  const basePrice = 95000;

  let tradesResult = null;

  addExchangeSchema({
    exchangeName: "binance-mock-audit-aggtrades",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / intervalMs) * intervalMs;
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push({
          timestamp: alignedSince + i * intervalMs,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }
      return result;
    },
    getAggregatedTrades: async () => [],
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-audit-aggtrades",
    interval: "1m",
    getSignal: async () => {
      if (tradesResult === null) {
        tradesResult = await getAggregatedTrades("BTCUSDT", 100);
      }
      return null;
    },
  });

  addFrameSchema({
    frameName: "audit-aggtrades-frame",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:01:00Z"),
  });

  for await (const _ of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-audit-aggtrades",
    exchangeName: "binance-mock-audit-aggtrades",
    frameName: "audit-aggtrades-frame",
  })) {
    // Just consume
  }

  if (Array.isArray(tradesResult) && tradesResult.length === 0) {
    pass("getAggregatedTrades terminated on empty history");
    return;
  }

  fail(`expected empty array, got ${JSON.stringify(tradesResult)}`);
});

/**
 * AUDIT: тот же бесконечный цикл жил в дубликате кода — ExchangeInstance
 * (classes/Exchange.ts, GUI-путь без execution-контекста). Проверяем
 * терминацию через публичный Exchange-утил.
 */
test("AUDIT Exchange.getAggregatedTrades: empty history terminates outside execution context", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "binance-mock-audit-aggtrades-utils",
    getCandles: async () => [],
    getAggregatedTrades: async () => [],
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  const trades = await Exchange.getAggregatedTrades(
    "BTCUSDT",
    { exchangeName: "binance-mock-audit-aggtrades-utils" },
    100,
  );

  if (Array.isArray(trades) && trades.length === 0) {
    pass("Exchange.getAggregatedTrades terminated on empty history");
    return;
  }

  fail(`expected empty array, got ${JSON.stringify(trades)}`);
});
