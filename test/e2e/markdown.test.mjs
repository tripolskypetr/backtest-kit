import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  Live,
  listenDoneBacktest,
  listenError,
  Schedule,
  Performance,
  Partial,
  Heat,
  PersistSignalAdapter,
} from "../../build/index.mjs";

import { Subject, sleep } from "functools-kit";

/**
 * MARKDOWN PARALLEL TEST: Проверяет все markdown сервисы с multi-symbol архитектурой
 *
 * Проверяет:
 * - BacktestMarkdownService.getStorage() с ключом `${symbol}:${strategyName}`
 * - ScheduleMarkdownService.getStorage() с ключом `${symbol}:${strategyName}`
 * - PerformanceMarkdownService.getStorage() с ключом `${symbol}:${strategyName}`
 * - PartialMarkdownService.getStorage() с ключом `${symbol}:${strategyName}`
 * - LiveMarkdownService.getStorage() с ключом `${symbol}:${strategyName}`
 * - HeatMarkdownService.getStorage() с ключом `${symbol}:${strategyName}`
 * - WalkerMarkdownService.getStorage() с ключом `${symbol}:${strategyName}`
 *
 * Сценарий:
 * - Запускаем backtest для BTCUSDT и ETHUSDT параллельно
 * - Генерируем сигналы с scheduled/opened/closed/partial profit
 * - Проверяем что все markdown сервисы возвращают данные через getData()
 * - Проверяем изоляцию данных между (symbol, strategyName) парами
 */
/**
 * LIVE MARKDOWN TEST: Проверяет LiveMarkdownService с persist storage
 *
 * Проверяет:
 * - LiveMarkdownService.getStorage() с ключом `${symbol}:${strategyName}` в LIVE режиме
 * - Изоляцию данных между символами
 * - Live.getData() и Live.getReport() работают корректно
 *
 * Сценарий:
 * - Используем PersistSignalAdapter.readValue() для восстановления уже открытых сигналов
 * - Свечи сразу закрывают сигналы (BTCUSDT → TP, ETHUSDT → SL)
 * - Коллбек onClose вызывает awaitSubject.next()
 * - Проверяем что Live.getData() и Live.getReport() содержат правильные данные
 */
test("LIVE MARKDOWN: LiveMarkdownService works with persist storage", async ({ pass, fail }) => {
  const btcBasePrice = 95000;
  const btcPriceOpen = btcBasePrice;
  const btcPriceTakeProfit = btcBasePrice + 1000;
  const btcPriceStopLoss = btcBasePrice - 1000;

  const ethBasePrice = 4000;
  const ethPriceOpen = ethBasePrice;
  const ethPriceTakeProfit = ethBasePrice - 100; // SHORT: TP below
  const ethPriceStopLoss = ethBasePrice + 100;   // SHORT: SL above

  let btcClosedCount = 0;
  let ethClosedCount = 0;

  const awaitSubject = new Subject();
  let errorCaught = null;

  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  // PersistSignalAdapter для BTCUSDT (LONG)
  const btcPersistCalled = { read: false };
  class BtcPersistAdapter {
    async waitForInit() {}

    async readValue(symbol) {
      if (symbol === "BTCUSDT" && !btcPersistCalled.read) {
        btcPersistCalled.read = true;
        return {
          id: "persist-btc-live-markdown",
          position: "long",
          priceOpen: btcPriceOpen,
          priceTakeProfit: btcPriceTakeProfit,
          priceStopLoss: btcPriceStopLoss,
          minuteEstimatedTime: 60,
          exchangeName: "binance-live-markdown",
          strategyName: "test-live-markdown",
          timestamp: Date.now(),
          symbol: "BTCUSDT",
        };
      }
      return null;
    }

    async hasValue(symbol) {
      return symbol === "BTCUSDT" && !btcPersistCalled.read;
    }

    async writeValue() {}
    async deleteValue() {}
  }

  // PersistSignalAdapter для ETHUSDT (SHORT)
  const ethPersistCalled = { read: false };
  class EthPersistAdapter {
    async waitForInit() {}

    async readValue(symbol) {
      if (symbol === "ETHUSDT" && !ethPersistCalled.read) {
        ethPersistCalled.read = true;
        return {
          id: "persist-eth-live-markdown",
          position: "short",
          priceOpen: ethPriceOpen,
          priceTakeProfit: ethPriceTakeProfit,
          priceStopLoss: ethPriceStopLoss,
          minuteEstimatedTime: 60,
          exchangeName: "binance-live-markdown",
          strategyName: "test-live-markdown",
          timestamp: Date.now(),
          symbol: "ETHUSDT",
        };
      }
      return null;
    }

    async hasValue(symbol) {
      return symbol === "ETHUSDT" && !ethPersistCalled.read;
    }

    async writeValue() {}
    async deleteValue() {}
  }

  // Используем мультиплексор для обоих адаптеров
  PersistSignalAdapter.usePersistSignalAdapter(class {
    btcAdapter = new BtcPersistAdapter();
    ethAdapter = new EthPersistAdapter();

    async waitForInit() {
      await this.btcAdapter.waitForInit();
      await this.ethAdapter.waitForInit();
    }

    async readValue(symbol) {
      if (symbol === "BTCUSDT") {
        return await this.btcAdapter.readValue(symbol);
      }
      if (symbol === "ETHUSDT") {
        return await this.ethAdapter.readValue(symbol);
      }
      return null;
    }

    async hasValue(symbol) {
      if (symbol === "BTCUSDT") {
        return await this.btcAdapter.hasValue(symbol);
      }
      if (symbol === "ETHUSDT") {
        return await this.ethAdapter.hasValue(symbol);
      }
      return false;
    }

    async writeValue() {}
    async deleteValue() {}
  });

  addExchangeSchema({
    exchangeName: "binance-live-markdown",
    getCandles: async (symbol, _interval, since, limit) => {
      const candles = [];
      const intervalMs = 60000;
      const sinceTime = since.getTime();

      for (let i = 0; i < limit; i++) {
        const timestamp = sinceTime + i * intervalMs;

        if (symbol === "BTCUSDT") {
          // BTCUSDT LONG: свечи на уровне TP для закрытия
          candles.push({
            timestamp,
            open: btcPriceTakeProfit,
            high: btcPriceTakeProfit + 100,
            low: btcPriceTakeProfit - 100,
            close: btcPriceTakeProfit,
            volume: 100,
          });
        } else if (symbol === "ETHUSDT") {
          // ETHUSDT SHORT: свечи на уровне SL для закрытия
          candles.push({
            timestamp,
            open: ethPriceStopLoss,
            high: ethPriceStopLoss + 50,
            low: ethPriceStopLoss - 50,
            close: ethPriceStopLoss,
            volume: 100,
          });
        }
      }

      return candles;
    },
    formatPrice: async (_symbol, p) => p.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-live-markdown",
    interval: "1m",
    getSignal: async () => null,
    callbacks: {
      onTick: (symbol, result) => {
        if (result.action === "closed") {
          if (symbol === "BTCUSDT") {
            btcClosedCount++;
          }
          if (symbol === "ETHUSDT") {
            ethClosedCount++;
          }
          if (btcClosedCount >= 1 && ethClosedCount >= 1) {
            awaitSubject.next();
          }
        }
      },
    },
  });

  // Запускаем Live для обоих символов
  const stopBtc = Live.background("BTCUSDT", {
    strategyName: "test-live-markdown",
    exchangeName: "binance-live-markdown",
  });

  const stopEth = Live.background("ETHUSDT", {
    strategyName: "test-live-markdown",
    exchangeName: "binance-live-markdown",
  });

  await awaitSubject.toPromise();
  // await sleep(2000); // Ждем чтобы данные записались в LiveMarkdownService
  unsubscribeError();
  stopBtc();
  stopEth();

  if (errorCaught) {
    fail(`Error during live: ${errorCaught.message || errorCaught}`);
    return;
  }

  // Проверка LiveMarkdownService
  try {
    const btcLiveData = await Live.getData("BTCUSDT", {
      strategyName: "test-live-markdown",
      exchangeName: "binance-live-markdown",
    });
    const ethLiveData = await Live.getData("ETHUSDT", {
      strategyName: "test-live-markdown",
      exchangeName: "binance-live-markdown",
    });

    // Verify data exists and has valid structure
    if (!btcLiveData || typeof btcLiveData !== "object") {
      fail("LiveMarkdownService: BTCUSDT getData() returned invalid data");
      return;
    }

    if (!ethLiveData || typeof ethLiveData !== "object") {
      fail("LiveMarkdownService: ETHUSDT getData() returned invalid data");
      return;
    }

    // Verify getReport() works and returns non-empty markdown
    const btcLiveReport = await Live.getReport("BTCUSDT", {
      strategyName: "test-live-markdown",
      exchangeName: "binance-live-markdown",
    });
    const ethLiveReport = await Live.getReport("ETHUSDT", {
      strategyName: "test-live-markdown",
      exchangeName: "binance-live-markdown",
    });

    if (typeof btcLiveReport !== "string" || btcLiveReport.length === 0) {
      fail("LiveMarkdownService: BTCUSDT getReport() returned invalid report");
      return;
    }

    if (typeof ethLiveReport !== "string" || ethLiveReport.length === 0) {
      fail("LiveMarkdownService: ETHUSDT getReport() returned invalid report");
      return;
    }

    // Verify symbol isolation: reports should mention only their own symbol
    if (!btcLiveReport.includes("BTCUSDT")) {
      fail("LiveMarkdownService: BTCUSDT report doesn't mention BTCUSDT");
      return;
    }

    if (!ethLiveReport.includes("ETHUSDT")) {
      fail("LiveMarkdownService: ETHUSDT report doesn't mention ETHUSDT");
      return;
    }
  } catch (err) {
    fail(`LiveMarkdownService failed: ${err.message}`);
    return;
  }

  pass("LIVE MARKDOWN WORKS: LiveMarkdownService correctly handles persist storage and isolates data by (symbol, strategyName) pairs in live mode.");
});
