import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  Live,
  Storage,
  Markdown,
  Heat,
  PersistSignalAdapter,
  PersistStrategyAdapter,
  PersistScheduleAdapter,
  PersistRecentAdapter,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Фантомная сделка из REPORT.md (16.0.0/16.1.0): статистика считала на одну
// ЗАКРЫТУЮ сделку больше, чем report/dump — точный дубль ПЕРВОГО закрытия.
//
// Механизм (общий для ТРЁХ сервисов с ленивым реплеем истории из Storage —
// Heat/Backtest/LiveMarkdownService): событие close, лениво триггернувшее
// waitForInit, к этому моменту УЖЕ записано Storage-подписчиком — реплей
// добавляет его из истории, затем штатный addSignal добавляет второй раз.
// Seen-set защищал только сам реплей, не событие-инициатор.
//
// Отличия по каналам:
// - Heat подписан на signalEmitter, который эмитится ПОСЛЕ
//   signalBacktestEmitter/signalLiveEmitter (Storage) — фантом безусловный;
// - Backtest/Live markdown подписаны на ТОТ ЖЕ эмиттер, что и Storage —
//   фантом при продакшен-порядке Storage.enable() ДО Markdown.enable();
//   у Live окно открывается, только когда ПЕРВОЕ событие ключа — сразу close
//   (рестарт процесса с дренажом восстановленной позиции).

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

/**
 * PHANTOM: BacktestMarkdownService — тот же реплей-дубль при ПРОДАКШЕН-порядке
 * подписки (Storage.enable() ДО Markdown.enable(): оба слушают
 * signalBacktestEmitter, Storage пишет строку первым). До фикса totalSignals=3
 * при 2 реальных закрытиях.
 */
test("PHANTOM: BacktestMarkdownService does not double-count the first close (Storage subscribed first)", async ({ pass, fail }) => {
  const context = {
    strategyName: "bt-phantom-strategy",
    exchangeName: "binance-bt-phantom",
    frameName: "bt-phantom-frame",
  };

  // Продакшен-порядок подписки на signalBacktestEmitter: Storage РАНЬШЕ Markdown
  Markdown.disable();
  Storage.enable();
  Markdown.enable();

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
        note: `bt phantom #${issued}`,
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

  const results = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    results.push(result.action);
  }
  const closedCount = results.filter((a) => a === "closed").length;
  if (closedCount !== 2) {
    fail(`expected exactly 2 closed trades in the run, got ${closedCount}`);
    return;
  }

  const stats = await Backtest.getData("BTCUSDT", context);
  // РЕГРЕССИЯ REPORT.md: до фикса тут было 3 (дубль первого закрытия реплеем)
  if (stats.totalSignals !== 2) {
    fail(`PHANTOM TRADE: BacktestMarkdownService counts ${stats.totalSignals} signals for 2 real closes`);
    return;
  }

  pass(`Storage-first subscription: 2 closes -> backtest report totalSignals=2 (no phantom)`);
});

/**
 * PHANTOM: LiveMarkdownService — окно открывается, когда ПЕРВОЕ событие ключа
 * для нового процесса — сразу close: рестарт с восстановленной истёкшей
 * позицией, первый tick дренирует её в time_expired. Storage (подписан раньше)
 * успевает записать строку до markdown-тика, ленивый реплей видит её — до
 * фикса totalClosed=2 при единственном реальном закрытии.
 */
test("PHANTOM: LiveMarkdownService does not double-count a close that is the first-ever event after a restart", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "live-phantom-strategy",
    exchangeName: "binance-live-phantom",
    frameName: "",
  };

  // Продакшен-порядок подписки на signalLiveEmitter: Storage РАНЬШЕ Markdown
  Markdown.disable();
  Storage.enable();
  Markdown.enable();

  PersistSignalAdapter.useJson();
  PersistStrategyAdapter.useJson();
  PersistScheduleAdapter.useJson();
  PersistRecentAdapter.useJson();

  try {
    // Сброс остатков прошлых прогонов сьюта
    await PersistScheduleAdapter.writeScheduleData(null, "BTCUSDT", context.strategyName, context.exchangeName);
    await PersistStrategyAdapter.writeStrategyData(
      {
        pendingSignalId: null,
        createdSignal: null,
        commitQueue: [],
        closedSignal: null,
        cancelledSignal: null,
        activatedSignal: null,
        takeProfitSignal: null,
        stopLossSignal: null,
        retryOpenSignal: null,
        retryOpenCount: 0,
        retryCloseCount: 0,
      },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );
    // «Прошлая жизнь процесса»: истёкшая pending-позиция, дренаж — первым же тиком
    await PersistSignalAdapter.writeSignalData(
      {
        id: "live-phantom-restored-x",
        position: "long",
        priceOpen: BASE_PRICE,
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 1,
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
        timestamp: t0,
        pendingAt: t0,
        scheduledAt: t0,
        symbol: "BTCUSDT",
        _isScheduled: false,
        note: "live phantom restored",
      },
      "BTCUSDT", context.strategyName, context.exchangeName,
    );

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
    addStrategySchema({
      strategyName: context.strategyName,
      interval: "1m",
      getSignal: async () => null,
    });

    // ПЕРВОЕ событие нового «процесса» — сразу closed (time_expired дренаж)
    const tick1 = await MethodContextService.runInContext(
      async () => await lib.strategyCoreService.tick("BTCUSDT", new Date(t0 + 5 * MIN), false, context),
      context,
    );
    if (tick1.action !== "closed" || tick1.closeReason !== "time_expired") {
      fail(`the first tick must drain the restored position (closed/time_expired), got "${tick1.action}"/"${tick1.closeReason}"`);
      return;
    }

    const stats = await Live.getData("BTCUSDT", context);
    // РЕГРЕССИЯ REPORT.md: до фикса тут было 2 (дубль единственного закрытия)
    if (stats.totalClosed !== 1) {
      fail(`PHANTOM TRADE: LiveMarkdownService counts ${stats.totalClosed} closed for 1 real close`);
      return;
    }

    pass(`restart drain as the first-ever event: 1 close -> live report totalClosed=1 (no phantom)`);
  } finally {
    PersistSignalAdapter.useDummy();
    PersistStrategyAdapter.useDummy();
    PersistScheduleAdapter.useDummy();
    PersistRecentAdapter.useDummy();
  }
});
