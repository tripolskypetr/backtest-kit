import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  Live,
  Heat,
  listenError,
  toProfitLossDto,
  PersistSignalAdapter,
} from "../../build/index.mjs";

import { Subject } from "functools-kit";

// ---------------------------------------------------------------------------
// multiplier × markdown-отчёты: проверяем ВЫЧИСЛЕНИЕ PNL, а не наличие колонок.
//
// Тест 1 (Backtest + Heat): один прогон с ТРЕМЯ сигналами разного плеча
// [1x, 3x, 10x] на неподвижной цене — все закрываются по time_expired с
// одинаковым безрычажным PNL (только издержки), поэтому:
//   - pnl_i обязан равняться m_i × reference (побитово тот же расчёт);
//   - кросс-отношения pnl(3x)/pnl(1x)=3 и pnl(10x)/pnl(1x)=10 — независимая
//     от эталона проверка;
//   - строка КАЖДОГО сигнала в Backtest.getReport несёт свой "{m}x" и свою
//     точно отформатированную ячейку PNL (формат колонки: sign + toFixed(2));
//   - Heat: totalPnl = Σ leveraged pnl = (1+3+10) × reference, totalTrades=3,
//     ячейка Total PNL в Heat.getReport — точное форматированное значение.
//
// Тест 2 (Live): два символа с разным плечом (BTC LONG 5x закрывается по TP,
// ETH SHORT 2x — по SL); закрытый PNL каждого равен m × reference на его
// точной цене закрытия, и каждый отчёт несёт свою точную ячейку PNL и "{m}x".
// ---------------------------------------------------------------------------

const MIN = 60_000;
const EPS = 1e-6;
const approxEqual = (a, b) => Math.abs(a - b) < EPS;

// Формат PNL-ячейки backtest_columns / live_columns: sign + toFixed(2) + "%"
const formatPnlCell = (pnl) => `${pnl > 0 ? "+" : ""}${pnl.toFixed(2)}%`;

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

test("MULTIPLIER MARKDOWN: Backtest report and Heat aggregate exact PNL for mixed-leverage signals [1x, 3x, 10x]", async ({ pass, fail }) => {
  const basePrice = 42000;
  const MULTIPLIERS = [1, 3, 10];
  const context = {
    strategyName: "multiplier-md-mixed-strategy",
    exchangeName: "binance-multiplier-md-mixed",
    frameName: "multiplier-md-mixed-frame",
  };

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: basePrice,
          high: basePrice,
          low: basePrice,
          close: basePrice,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let issued = 0;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued >= MULTIPLIERS.length) return null;
      const multiplier = MULTIPLIERS[issued];
      issued += 1;
      return {
        position: "long",
        note: `mixed leverage ${multiplier}x`,
        // Широкие TP/SL: на неподвижной цене все закрытия — time_expired
        priceTakeProfit: basePrice + 15000,
        priceStopLoss: basePrice - 15000,
        minuteEstimatedTime: 3,
        multiplier,
      };
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const closed = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    if (result.action === "closed") {
      closed.push(result);
    }
  }

  if (closed.length !== MULTIPLIERS.length) {
    fail(`expected ${MULTIPLIERS.length} closed trades, got ${closed.length}`);
    return;
  }

  // Безрычажный эталон: цена не двигалась — у всех трёх сделок он одинаков
  const reference = toProfitLossDto(
    {
      position: "long",
      priceOpen: closed[0].signal.originalPriceOpen,
      cost: closed[0].signal.cost,
      multiplier: 1,
    },
    closed[0].currentPrice,
  );
  if (reference.pnlPercentage >= 0) {
    fail(`sanity: costs-only reference PNL must be negative, got ${reference.pnlPercentage}`);
    return;
  }

  // 1) Каждое закрытие = m_i × reference
  for (let i = 0; i < MULTIPLIERS.length; i++) {
    const m = MULTIPLIERS[i];
    if (closed[i].signal.multiplier !== m) {
      fail(`closed #${i} must carry multiplier ${m}, got ${closed[i].signal.multiplier}`);
      return;
    }
    const expected = m * reference.pnlPercentage;
    if (!approxEqual(closed[i].pnl.pnlPercentage, expected)) {
      fail(`closed #${i} (${m}x): expected pnl ${expected}, got ${closed[i].pnl.pnlPercentage}`);
      return;
    }
    // pnlCost следует за pnlPercentage, pnlEntries не скейлится
    const expectedCost = (closed[i].pnl.pnlPercentage / 100) * closed[i].pnl.pnlEntries;
    if (!approxEqual(closed[i].pnl.pnlCost, expectedCost) || closed[i].pnl.pnlEntries !== reference.pnlEntries) {
      fail(`closed #${i} (${m}x): pnlCost identity or unscaled pnlEntries violated`);
      return;
    }
  }

  // 2) Кросс-отношения — независимая от эталона проверка масштабирования
  const ratio3 = closed[1].pnl.pnlPercentage / closed[0].pnl.pnlPercentage;
  const ratio10 = closed[2].pnl.pnlPercentage / closed[0].pnl.pnlPercentage;
  if (!approxEqual(ratio3, 3) || !approxEqual(ratio10, 10)) {
    fail(`cross-ratios must be exactly 3 and 10, got ${ratio3} and ${ratio10}`);
    return;
  }

  // 3) Markdown-строка КАЖДОГО сигнала несёт свой multiplier и свой точный PNL
  const report = await Backtest.getReport("BTCUSDT", context);
  const lines = report.split("\n");
  for (let i = 0; i < MULTIPLIERS.length; i++) {
    const m = MULTIPLIERS[i];
    const signalId = closed[i].signal.id;
    const row = lines.find((line) => line.includes(signalId));
    if (!row) {
      fail(`report must contain a table row for signal ${signalId} (${m}x)`);
      return;
    }
    const pnlCell = formatPnlCell(closed[i].pnl.pnlPercentage);
    if (!row.includes(` ${m}x `)) {
      fail(`row of signal ${signalId} must render the multiplier "${m}x": ${row}`);
      return;
    }
    if (!row.includes(` ${pnlCell} `)) {
      fail(`row of signal ${signalId} (${m}x) must render the exact leveraged PNL "${pnlCell}": ${row}`);
      return;
    }
  }
  // Ячейки PNL трёх строк обязаны различаться (плечо реально масштабирует)
  const cells = closed.map(({ pnl }) => formatPnlCell(pnl.pnlPercentage));
  if (new Set(cells).size !== MULTIPLIERS.length) {
    fail(`the three PNL cells must differ, got [${cells.join(", ")}]`);
    return;
  }

  // 4) Heat: totalPnl = Σ leveraged pnl = (1+3+10) × reference
  const expectedTotal = MULTIPLIERS.reduce((acc, m) => acc + m, 0) * reference.pnlPercentage;
  const stats = await Heat.getData(context, true);
  const row = stats.symbols.find((s) => s.symbol === "BTCUSDT");
  if (!row) {
    fail(`heatmap must contain a BTCUSDT row`);
    return;
  }
  if (row.totalTrades !== MULTIPLIERS.length) {
    fail(`heatmap totalTrades must be ${MULTIPLIERS.length}, got ${row.totalTrades}`);
    return;
  }
  if (!approxEqual(row.totalPnl, expectedTotal)) {
    fail(`heatmap totalPnl must be Σ(m_i) × reference = ${expectedTotal}, got ${row.totalPnl}`);
    return;
  }
  if (!approxEqual(row.avgPnl, expectedTotal / MULTIPLIERS.length)) {
    fail(`heatmap avgPnl must be ${expectedTotal / MULTIPLIERS.length}, got ${row.avgPnl}`);
    return;
  }

  // 5) Heat.getReport — точная ячейка Total PNL (формат heat_columns: toFixed(2) + "%")
  const heatReport = await Heat.getReport(context, true);
  const totalPnlCell = `${expectedTotal.toFixed(2)}%`;
  if (!heatReport.includes(` ${totalPnlCell} `)) {
    fail(`Heat report must render the exact aggregated Total PNL cell "${totalPnlCell}"`);
    return;
  }

  pass(`mixed leverage verified: pnl = [${cells.join(", ")}] (1x/3x/10x of ${reference.pnlPercentage.toFixed(6)}%), heat totalPnl = ${totalPnlCell}`);
});

test("MULTIPLIER MARKDOWN: Heat equity math survives a leveraged blow-up (300x, pnl < -100%)", async ({ pass, fail }) => {
  // Плечо делает pnlPercentage <= -100% практически достижимым (раньше — нет):
  // 300x на неподвижной цене даёт ~300 × -0.3996% ≈ -119.88%. Equity-кривая
  // обязана уйти в blown-ветку (equity <= 0 -> maxDrawdown = 100, без NaN),
  // а линейный totalPnl — остаться точным leveraged значением.
  const basePrice = 42000;
  const MULTIPLIER = 300;
  const context = {
    strategyName: "multiplier-md-blown-strategy",
    exchangeName: "binance-multiplier-md-blown",
    frameName: "multiplier-md-blown-frame",
  };

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: basePrice,
          high: basePrice,
          low: basePrice,
          close: basePrice,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "300x blown",
        priceTakeProfit: basePrice + 15000,
        priceStopLoss: basePrice - 15000,
        minuteEstimatedTime: 3,
        multiplier: MULTIPLIER,
      };
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-02-01T00:00:00Z"),
    endDate: new Date("2024-02-01T00:20:00Z"),
  });

  const closed = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    if (result.action === "closed") closed.push(result);
  }
  if (closed.length !== 1) {
    fail(`expected exactly 1 closed trade, got ${closed.length}`);
    return;
  }

  const reference = toProfitLossDto(
    {
      position: "long",
      priceOpen: closed[0].signal.originalPriceOpen,
      cost: closed[0].signal.cost,
      multiplier: 1,
    },
    closed[0].currentPrice,
  );
  const expected = MULTIPLIER * reference.pnlPercentage;
  if (expected >= -100) {
    fail(`sanity: 300x costs-only PNL must be below -100%, got ${expected}`);
    return;
  }
  if (!approxEqual(closed[0].pnl.pnlPercentage, expected)) {
    fail(`closed pnl must be ${MULTIPLIER}x the reference: expected ${expected}, got ${closed[0].pnl.pnlPercentage}`);
    return;
  }

  const stats = await Heat.getData(context, true);
  const row = stats.symbols.find((s) => s.symbol === "BTCUSDT");
  if (!row) {
    fail("heatmap must contain a BTCUSDT row");
    return;
  }
  // Линейный totalPnl — точное leveraged значение (< -100% допустимо)
  if (!approxEqual(row.totalPnl, expected)) {
    fail(`heatmap totalPnl must be the exact leveraged value ${expected}, got ${row.totalPnl}`);
    return;
  }
  // Equity-кривая: (1 + pnl/100) <= 0 -> blown-ветка, maxDrawdown зафиксирован на 100
  if (row.maxDrawdown !== 100) {
    fail(`blown equity curve must fix maxDrawdown at 100, got ${row.maxDrawdown}`);
    return;
  }
  // Никакой NaN/Infinity не просочился в отчёт (isUnsafe-гварды)
  const heatReport = await Heat.getReport(context, true);
  if (heatReport.includes("NaN") || heatReport.includes("Infinity")) {
    fail("heat report must not contain NaN/Infinity after a leveraged blow-up");
    return;
  }
  if (!heatReport.includes(` ${expected.toFixed(2)}% `)) {
    fail(`heat report must render the exact leveraged Total PNL cell "${expected.toFixed(2)}%"`);
    return;
  }

  pass(`300x blow-up handled: totalPnl = ${row.totalPnl.toFixed(2)}% (< -100%), maxDrawdown fixed at 100, no NaN in report`);
});

test("MULTIPLIER MARKDOWN: Live reports carry exact leveraged PNL per symbol (BTC 5x TP, ETH SHORT 2x SL)", async ({ pass, fail }) => {
  const btcPriceOpen = 95000;
  const btcPriceTakeProfit = btcPriceOpen + 1000;
  const btcPriceStopLoss = btcPriceOpen - 1000;
  const BTC_MULTIPLIER = 5;

  const ethPriceOpen = 4000;
  const ethPriceTakeProfit = ethPriceOpen - 100; // SHORT: TP ниже
  const ethPriceStopLoss = ethPriceOpen + 100;   // SHORT: SL выше
  const ETH_MULTIPLIER = 2;

  const closedBySymbol = {};
  const awaitSubject = new Subject();
  let errorCaught = null;

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  const makeRow = (symbol) => symbol === "BTCUSDT"
    ? {
        id: "persist-multiplier-md-live-btc",
        position: "long",
        priceOpen: btcPriceOpen,
        priceTakeProfit: btcPriceTakeProfit,
        priceStopLoss: btcPriceStopLoss,
        minuteEstimatedTime: 60,
        multiplier: BTC_MULTIPLIER,
        exchangeName: "binance-multiplier-md-live",
        strategyName: "multiplier-md-live-strategy",
        timestamp: Date.now(),
        symbol,
      }
    : {
        id: "persist-multiplier-md-live-eth",
        position: "short",
        priceOpen: ethPriceOpen,
        priceTakeProfit: ethPriceTakeProfit,
        priceStopLoss: ethPriceStopLoss,
        minuteEstimatedTime: 60,
        multiplier: ETH_MULTIPLIER,
        exchangeName: "binance-multiplier-md-live",
        strategyName: "multiplier-md-live-strategy",
        timestamp: Date.now(),
        symbol,
      };

  // Мультиплексор: каждый инстанс привязан к symbol, отдаёт restored-позицию один раз
  PersistSignalAdapter.usePersistSignalAdapter(class {
    constructor(symbol) {
      this._symbol = symbol;
      this._read = false;
    }

    async waitForInit() {}

    async readSignalData() {
      if (this._read) return null;
      this._read = true;
      return makeRow(this._symbol);
    }

    async writeSignalData() {}
  });

  addExchangeSchema({
    exchangeName: "binance-multiplier-md-live",
    getCandles: async (symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      // BTC LONG: свечи на TP (закрытие take_profit по 96000);
      // ETH SHORT: свечи на SL (закрытие stop_loss по 4100)
      const price = symbol === "BTCUSDT" ? btcPriceTakeProfit : ethPriceStopLoss;
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "multiplier-md-live-strategy",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onTick: (symbol, result) => {
        if (result.action === "closed") {
          closedBySymbol[symbol] = result;
          if (closedBySymbol["BTCUSDT"] && closedBySymbol["ETHUSDT"]) {
            awaitSubject.next();
          }
        }
      },
    },
  });

  const stopBtc = Live.background("BTCUSDT", {
    strategyName: "multiplier-md-live-strategy",
    exchangeName: "binance-multiplier-md-live",
  });
  const stopEth = Live.background("ETHUSDT", {
    strategyName: "multiplier-md-live-strategy",
    exchangeName: "binance-multiplier-md-live",
  });

  try {
    await awaitSubject.toPromise();
    unsubscribeError();
    stopBtc();
    stopEth();

    if (errorCaught) {
      fail(`Error during live: ${errorCaught.message || errorCaught}`);
      return;
    }

    // 1) Закрытый PNL каждого символа = m × безрычажный эталон на его цене закрытия
    const checks = [
      { symbol: "BTCUSDT", position: "long", priceOpen: btcPriceOpen, multiplier: BTC_MULTIPLIER },
      { symbol: "ETHUSDT", position: "short", priceOpen: ethPriceOpen, multiplier: ETH_MULTIPLIER },
    ];
    for (const { symbol, position, priceOpen, multiplier } of checks) {
      const result = closedBySymbol[symbol];
      const reference = toProfitLossDto(
        { position, priceOpen, multiplier: 1 },
        result.currentPrice,
      );
      const expected = multiplier * reference.pnlPercentage;
      if (!approxEqual(result.pnl.pnlPercentage, expected)) {
        fail(`${symbol} (${multiplier}x): expected closed pnl ${expected}, got ${result.pnl.pnlPercentage}`);
        return;
      }
      if (result.signal.multiplier !== multiplier) {
        fail(`${symbol}: closed signal must carry multiplier ${multiplier}, got ${result.signal.multiplier}`);
        return;
      }
    }

    // 2) Каждый отчёт несёт СВОЮ точную PNL-ячейку и свой multiplier
    for (const { symbol, multiplier } of checks) {
      const report = await Live.getReport(symbol, {
        strategyName: "multiplier-md-live-strategy",
        exchangeName: "binance-multiplier-md-live",
      });
      const pnlCell = formatPnlCell(closedBySymbol[symbol].pnl.pnlPercentage);
      const row = report.split("\n").find(
        (line) => line.includes("CLOSED") && line.includes(` ${multiplier}x `),
      );
      if (!row) {
        fail(`${symbol} report must contain the closed row with "${multiplier}x"`);
        return;
      }
      if (!row.includes(` ${pnlCell} `)) {
        fail(`${symbol} closed row must render the exact leveraged PNL "${pnlCell}": ${row}`);
        return;
      }
    }

    const btcCell = formatPnlCell(closedBySymbol["BTCUSDT"].pnl.pnlPercentage);
    const ethCell = formatPnlCell(closedBySymbol["ETHUSDT"].pnl.pnlPercentage);
    pass(`live leveraged PNL verified per symbol: BTC 5x take_profit ${btcCell}, ETH SHORT 2x stop_loss ${ethCell}`);
  } finally {
    PersistSignalAdapter.useDummy();
  }
});

test("MULTIPLIER MARKDOWN: Heat per-symbol ratios under mixed leverage — winRate invariant, PF/avgWin/avgLoss/stdDev/sharpe exactly leveraged", async ({ pass, fail }) => {
  // HeatMarkdownService.calculateSymbolStats питается закрытыми pnl.pnlPercentage,
  // которые уже leveraged. Здесь — сценарий с ПОБЕДАМИ И УБЫТКАМИ (пила ±5% по
  // чётности минуты, TP/SL ±2%, направление чередуется long/short) и смешанным
  // плечом [1x, 2x, 5x, 10x] на 12 сделках (≥ MIN_SIGNALS_FOR_RATIOS = 10):
  //   - winRate ИНВАРИАНТЕН к плечу: положительный множитель не меняет знак
  //     сделки — сверяем с winRate, посчитанным из БЕЗРЫЧАЖНЫХ эталонов;
  //   - profitFactor НЕ инвариантен: плечо перевешивает победы/убытки —
  //     сверяем точное leveraged значение И что оно отличается от 1x-эталона;
  //   - avgWin/avgLoss/totalPnl/avgPnl/stdDev (Бессель, N−1)/sharpe — точная
  //     сверка с формулами сервиса на leveraged рядах;
  //   - equity maxDrawdown ≥ худшего одиночного leveraged-убытка (просадка от
  //     пика не меньше величины самого убытка), но без blown-ветки (< 100);
  //   - Heat.getReport не содержит NaN/Infinity.
  const priceLow = 42000;
  const priceHigh = 44100; // +5% — гарантированно пробивает TP/SL ±2% за минуту
  const MULTIPLIERS = [1, 2, 5, 10];
  const TOTAL_SIGNALS = 12;
  const context = {
    strategyName: "multiplier-md-heat-ratios-strategy",
    exchangeName: "binance-multiplier-md-heat-ratios",
    frameName: "multiplier-md-heat-ratios-frame",
  };

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MIN;
        // Пила по чётности АБСОЛЮТНОЙ минуты — детерминирована и не зависит
        // от точки входа в свечной запрос
        const price = Math.floor(timestamp / MIN) % 2 === 0 ? priceLow : priceHigh;
        candles.push({
          timestamp,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let issued = 0;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async (_symbol, _when, currentPrice) => {
      if (issued >= TOTAL_SIGNALS) return null;
      const multiplier = MULTIPLIERS[issued % MULTIPLIERS.length];
      // Направление выбираем ОТ ФАЗЫ пилы: с priceLow следующий ход — вверх,
      // с priceHigh — вниз. Чётный сигнал ставим ПО ходу (победа, TP), нечётный
      // ПРОТИВ (убыток, SL) — ровно 6W/6L независимо от минуты входа.
      const nextMoveUp = currentPrice < (priceLow + priceHigh) / 2;
      const wantWin = issued % 2 === 0;
      const position = wantWin === nextMoveUp ? "long" : "short";
      issued += 1;
      const tpOffset = currentPrice * 0.02;
      return {
        position,
        note: `heat ratios ${multiplier}x ${position}`,
        priceTakeProfit: position === "long" ? currentPrice + tpOffset : currentPrice - tpOffset,
        priceStopLoss: position === "long" ? currentPrice - tpOffset : currentPrice + tpOffset,
        minuteEstimatedTime: 10,
        multiplier,
      };
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-03-01T00:00:00Z"),
    endDate: new Date("2024-03-01T04:00:00Z"),
  });

  const closed = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    if (result.action === "closed") closed.push(result);
  }
  if (closed.length !== TOTAL_SIGNALS) {
    fail(`expected ${TOTAL_SIGNALS} closed trades, got ${closed.length}`);
    return;
  }

  // 1) Каждое закрытие = m_i × безрычажный эталон на СВОЕЙ цене закрытия;
  //    знак сделки инвариантен к плечу
  const references = [];
  for (let i = 0; i < TOTAL_SIGNALS; i++) {
    const m = MULTIPLIERS[i % MULTIPLIERS.length];
    const result = closed[i];
    if (result.signal.multiplier !== m) {
      fail(`closed #${i} must carry multiplier ${m}, got ${result.signal.multiplier}`);
      return;
    }
    const reference = toProfitLossDto(
      {
        position: result.signal.position,
        priceOpen: result.signal.originalPriceOpen,
        cost: result.signal.cost,
        multiplier: 1,
      },
      result.currentPrice,
    );
    references.push(reference.pnlPercentage);
    if (!approxEqual(result.pnl.pnlPercentage, m * reference.pnlPercentage)) {
      fail(`closed #${i} (${m}x ${result.signal.position}): expected pnl ${m * reference.pnlPercentage}, got ${result.pnl.pnlPercentage}`);
      return;
    }
    if (Math.sign(result.pnl.pnlPercentage) !== Math.sign(reference.pnlPercentage)) {
      fail(`closed #${i} (${m}x): a positive multiplier must never flip the trade sign`);
      return;
    }
  }

  const leveraged = closed.map(({ pnl }) => pnl.pnlPercentage);
  const levWins = leveraged.filter((pnl) => pnl > 0);
  const levLosses = leveraged.filter((pnl) => pnl < 0);
  if (levWins.length === 0 || levLosses.length === 0) {
    fail(`scenario must produce both wins and losses, got ${levWins.length} wins / ${levLosses.length} losses`);
    return;
  }

  const stats = await Heat.getData(context, true);
  const row = stats.symbols.find((s) => s.symbol === "BTCUSDT");
  if (!row) {
    fail("heatmap must contain a BTCUSDT row");
    return;
  }
  if (row.totalTrades !== TOTAL_SIGNALS) {
    fail(`heatmap totalTrades must be ${TOTAL_SIGNALS}, got ${row.totalTrades}`);
    return;
  }

  // 2) winRate инвариантен к плечу — считаем его из БЕЗРЫЧАЖНЫХ эталонов
  const refWinCount = references.filter((pnl) => pnl > 0).length;
  const refLossCount = references.filter((pnl) => pnl < 0).length;
  const refWinRate = (refWinCount / (refWinCount + refLossCount)) * 100;
  if (!approxEqual(row.winRate, refWinRate)) {
    fail(`winRate must be leverage-invariant: expected ${refWinRate} (from 1x references), got ${row.winRate}`);
    return;
  }

  // 3) Линейные агрегаты — точные leveraged значения
  const expectedTotal = leveraged.reduce((a, b) => a + b, 0);
  const expectedAvg = expectedTotal / TOTAL_SIGNALS;
  if (!approxEqual(row.totalPnl, expectedTotal) || !approxEqual(row.avgPnl, expectedAvg)) {
    fail(`totalPnl/avgPnl mismatch: expected ${expectedTotal}/${expectedAvg}, got ${row.totalPnl}/${row.avgPnl}`);
    return;
  }
  const expectedAvgWin = levWins.reduce((a, b) => a + b, 0) / levWins.length;
  const expectedAvgLoss = levLosses.reduce((a, b) => a + b, 0) / levLosses.length;
  if (!approxEqual(row.avgWin, expectedAvgWin) || !approxEqual(row.avgLoss, expectedAvgLoss)) {
    fail(`avgWin/avgLoss mismatch: expected ${expectedAvgWin}/${expectedAvgLoss}, got ${row.avgWin}/${row.avgLoss}`);
    return;
  }

  // 4) stdDev (выборочная, N−1) и sharpe = avgPnl / stdDev — на leveraged ряде
  const variance = leveraged.reduce((acc, pnl) => acc + Math.pow(pnl - expectedAvg, 2), 0) / (TOTAL_SIGNALS - 1);
  const expectedStdDev = Math.sqrt(variance);
  if (!approxEqual(row.stdDev, expectedStdDev)) {
    fail(`stdDev must be computed over leveraged pnl: expected ${expectedStdDev}, got ${row.stdDev}`);
    return;
  }
  if (!approxEqual(row.sharpeRatio, expectedAvg / expectedStdDev)) {
    fail(`sharpeRatio mismatch: expected ${expectedAvg / expectedStdDev}, got ${row.sharpeRatio}`);
    return;
  }

  // 5) profitFactor: точное leveraged значение, И оно обязано ОТЛИЧАТЬСЯ от
  //    1x-эталона — смешанное плечо перевешивает победы против убытков
  const expectedPf = levWins.reduce((a, b) => a + b, 0) / Math.abs(levLosses.reduce((a, b) => a + b, 0));
  if (!approxEqual(row.profitFactor, expectedPf)) {
    fail(`profitFactor mismatch: expected ${expectedPf}, got ${row.profitFactor}`);
    return;
  }
  const refPf = references.filter((pnl) => pnl > 0).reduce((a, b) => a + b, 0) /
    Math.abs(references.filter((pnl) => pnl < 0).reduce((a, b) => a + b, 0));
  if (Math.abs(expectedPf - refPf) / refPf < 1e-3) {
    fail(`mixed leverage must reweight profitFactor: leveraged ${expectedPf} vs 1x reference ${refPf}`);
    return;
  }

  // 6) Equity maxDrawdown: просадка от пика не меньше величины худшего
  //    одиночного leveraged-убытка (equity ≤ peak перед ним), но аккаунт жив
  const worstLoss = Math.abs(Math.min(...levLosses));
  if (row.maxDrawdown < worstLoss - EPS || row.maxDrawdown >= 100) {
    fail(`maxDrawdown must be in [${worstLoss}, 100): got ${row.maxDrawdown}`);
    return;
  }

  // 7) Отчёт рендерится без NaN/Infinity
  const heatReport = await Heat.getReport(context, true);
  if (heatReport.includes("NaN") || heatReport.includes("Infinity")) {
    fail("heat report must not contain NaN/Infinity under mixed leverage");
    return;
  }

  pass(`heat ratios verified on ${levWins.length}W/${levLosses.length}L: winRate ${row.winRate.toFixed(1)}% (leverage-invariant), PF ${expectedPf.toFixed(3)} (1x ref ${refPf.toFixed(3)}), sharpe ${row.sharpeRatio.toFixed(3)}, maxDD ${row.maxDrawdown.toFixed(2)}%`);
});
