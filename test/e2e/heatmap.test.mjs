import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  Storage,
  Heat,
} from "../../build/index.mjs";

// Фантомная сделка из REPORT.md (16.0.0/16.1.0): при включённых Storage и
// Markdown/heatmap portfolioTotalTrades/totalPnl считали на одну ЗАКРЫТУЮ
// сделку больше, чем report/dump — точный дубль ПЕРВОГО закрытия прогона.
//
// Механизм: CALL_SIGNAL_EMIT_FN эмитит closed СНАЧАЛА в signalBacktestEmitter
// (Storage пишет строку), ПОТОМ в signalEmitter (heat-тик). Первый close-тик
// await'ит ленивый HeatmapStorage.waitForInit, чей реплей истории из Storage
// уже видит ЭТОТ close (записан шагом раньше) и добавляет его; затем штатный
// addSignal добавляет его второй раз. Seen-set защищал только сам реплей, не
// событие, которое его инициировало — ровно +1 сделка в каждом прогоне.

const MIN = 60_000;
const BASE_PRICE = 50000;

/**
 * HEATMAP: закрытий в прогоне ровно столько, сколько в статистике — первый
 * close не дублируется реплеем waitForInit (Storage включён и пишет РАНЬШЕ
 * heat-тика; дедуп по signal.id обязан снять двойной учёт).
 */
test("HEATMAP: the first close is not double-counted by the lazy history replay", async ({ pass, fail }) => {
  const context = {
    strategyName: "heatmap-phantom-strategy",
    exchangeName: "binance-heatmap-phantom",
    frameName: "heatmap-phantom-frame",
  };

  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const aligned = Math.floor(since.getTime() / MIN) * MIN;
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: aligned + i * MIN,
          open: BASE_PRICE,
          high: BASE_PRICE,
          low: BASE_PRICE,
          close: BASE_PRICE,
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
      if (issued >= 2) return null;
      issued += 1;
      return {
        position: "long",
        note: `heatmap phantom #${issued}`,
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 3,
      };
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  // КЛЮЧЕВОЕ УСЛОВИЕ РЕПРО: Storage включён — его подписчик на
  // signalBacktestEmitter пишет close ДО того, как heat-тик (signalEmitter)
  // запустит ленивый реплей истории
  Storage.enable();

  const results = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    results.push(`${result.action}${result.closeReason ? "/" + result.closeReason : ""}`);
  }
  const closedResults = results.filter((r) => r.startsWith("closed"));
  if (closedResults.length !== 2) {
    fail(`expected exactly 2 closed trades in the run, got ${closedResults.length} (${JSON.stringify(results)})`);
    return;
  }

  const stats = await Heat.getData(context, true);
  const row = stats.symbols.find((s) => s.symbol === "BTCUSDT");
  if (!row) {
    fail(`heatmap must contain a BTCUSDT row, got symbols=[${stats.symbols.map((s) => s.symbol).join(", ")}]`);
    return;
  }

  // РЕГРЕССИЯ REPORT.md: до фикса тут было 3 (дубль первого закрытия)
  if (row.totalTrades !== 2) {
    fail(`PHANTOM TRADE: heatmap counts ${row.totalTrades} trades for 2 real closes (the first close was double-counted by the waitForInit replay)`);
    return;
  }
  if (stats.portfolioTotalTrades !== 2) {
    fail(`portfolioTotalTrades must equal the real close count 2, got ${stats.portfolioTotalTrades}`);
    return;
  }
  // Обе сделки идентичны → totalPnl обязан быть ровно 2× per-trade (не 3×)
  const perTrade = row.totalPnl / row.totalTrades;
  if (Math.abs(row.totalPnl - 2 * perTrade) > 1e-9 || row.avgPnl === null || Math.abs(row.avgPnl - perTrade) > 1e-9) {
    fail(`totalPnl/avgPnl inconsistent with 2 trades: totalPnl=${row.totalPnl} avgPnl=${row.avgPnl}`);
    return;
  }

  pass(`2 closes -> heatmap totalTrades=2, portfolioTotalTrades=2 (no phantom duplicate of the first close)`);
});
