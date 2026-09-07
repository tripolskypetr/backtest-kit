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
