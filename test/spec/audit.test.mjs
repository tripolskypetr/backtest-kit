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
