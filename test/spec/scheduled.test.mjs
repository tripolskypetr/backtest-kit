import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  Schedule,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter, sleep } from "functools-kit";

test("Schedule.getData returns ScheduleStatistics structure", async ({ pass, fail }) => {

  addExchange({
    exchangeName: "binance-mock-schedule-getdata",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  let signalCount = 0;

  addStrategy({
    strategyName: "test-strategy-schedule-getdata",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount === 1) {
        const price = await getAveragePrice("BTCUSDT");
        return {
          position: "long",
          note: "Schedule getData test",
          priceOpen: price - 100,
          priceTakeProfit: price + 1_000,
          priceStopLoss: price - 10_000,
          minuteEstimatedTime: 120,
        };
      }
      return null;
    },
  });

  addFrame({
    frameName: "1d-schedule-getdata",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  for await (const _result of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-schedule-getdata",
    exchangeName: "binance-mock-schedule-getdata",
    frameName: "1d-schedule-getdata",
  })) {
    // Consume all results
  }

  const stats = await Schedule.getData("test-strategy-schedule-getdata");

  if (
    stats &&
    typeof stats.totalEvents === "number" &&
    typeof stats.totalScheduled === "number" &&
    typeof stats.totalCancelled === "number" &&
    Array.isArray(stats.eventList)
  ) {
    pass(`Schedule.getData returned valid ScheduleStatistics with ${stats.totalEvents} events`);
    return;
  }

  fail("Schedule.getData returned invalid structure");

});

test("Schedule.getData calculates cancellation rate", async ({ pass, fail }) => {

  addExchange({
    exchangeName: "binance-mock-schedule-metrics",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  let signalCount = 0;

  addStrategy({
    strategyName: "test-strategy-schedule-metrics",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount === 1) {
        // Scheduled signal that will be cancelled (price never reaches entry)
        return {
          position: "long",
          note: "Schedule metrics test - will cancel",
          priceOpen: 10000,
          priceTakeProfit: 11000,
          priceStopLoss: 5000,
          minuteEstimatedTime: 60,
        };
      }
      return null;
    },
  });

  addFrame({
    frameName: "1d-schedule-metrics",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  for await (const _result of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-schedule-metrics",
    exchangeName: "binance-mock-schedule-metrics",
    frameName: "1d-schedule-metrics",
  })) {
    // Consume all results
  }

  const stats = await Schedule.getData("test-strategy-schedule-metrics");

  const hasAllMetrics =
    stats &&
    Array.isArray(stats.eventList) &&
    typeof stats.totalEvents === "number" &&
    typeof stats.totalScheduled === "number" &&
    typeof stats.totalCancelled === "number" &&
    (stats.cancellationRate === null || typeof stats.cancellationRate === "number") &&
    (stats.avgWaitTime === null || typeof stats.avgWaitTime === "number");

  if (hasAllMetrics) {
    pass("All statistical metrics are present: eventList, totalEvents, totalScheduled, totalCancelled, cancellationRate, avgWaitTime");
    return;
  }

  fail("Some statistical metrics are missing or have wrong type");

});

test("Schedule.getData returns null for cancellation rate with empty data", async ({ pass, fail }) => {

  addExchange({
    exchangeName: "binance-mock-schedule-safe",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addStrategy({
    strategyName: "test-strategy-schedule-safe",
    interval: "1m",
    getSignal: async () => {
      return null;
    },
  });

  addFrame({
    frameName: "1d-schedule-safe",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  for await (const _result of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-schedule-safe",
    exchangeName: "binance-mock-schedule-safe",
    frameName: "1d-schedule-safe",
  })) {
    // Consume all results
  }

  const stats = await Schedule.getData("test-strategy-schedule-safe");

  if (
    stats &&
    stats.totalScheduled === 0 &&
    stats.totalCancelled === 0 &&
    stats.cancellationRate === null &&
    stats.avgWaitTime === null
  ) {
    pass("Safe math returns null for cancellation rate with empty data");
    return;
  }

  fail("Safe math did not return null for cancellation metrics");

});

test("Schedule.getData tracks scheduled signal lifecycle", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60000; // 1 минута
  const basePrice = 42000;
  const bufferMinutes = 4;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  let allCandles = [];

  // Предзаполняем минимум 5 свечей
  for (let i = 0; i < 5; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 100,
    });
  }

  addExchange({
    exchangeName: "binance-mock-schedule-lifecycle",
    getCandles: async (_symbol, _interval, since, limit) => {
      const sinceIndex = Math.floor((since.getTime() - bufferStartTime) / intervalMs);
      const result = allCandles.slice(sinceIndex, sinceIndex + limit);
      return result.length > 0 ? result : allCandles.slice(0, Math.min(limit, allCandles.length));
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  let signalCount = 0;
  let scheduledCount = 0;

  addStrategy({
    strategyName: "test-strategy-schedule-lifecycle",
    interval: "1m",
    getSignal: async () => {
      signalCount++;
      if (signalCount === 1) {
        allCandles = [];

        // Буферные свечи (4 минуты ДО startTime)
        for (let i = 0; i < bufferMinutes; i++) {
          allCandles.push({
            timestamp: bufferStartTime + i * intervalMs,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 100,
            close: basePrice,
            volume: 100,
          });
        }

        // Генерируем свечи на 1 день (1440 минут)
        for (let i = 0; i < 1440; i++) {
          const timestamp = startTime + i * intervalMs;

          if (i < 10) {
            // Первые 10 минут: цена выше priceOpen (ожидание)
            allCandles.push({
              timestamp,
              open: basePrice + 200,
              high: basePrice + 300,
              low: basePrice + 100,
              close: basePrice + 200,
              volume: 100,
            });
          } else if (i >= 10 && i < 20) {
            // 10-20 минут: цена падает, активируется priceOpen
            allCandles.push({
              timestamp,
              open: basePrice - 200,
              high: basePrice + 100,
              low: basePrice - 200,
              close: basePrice - 100,
              volume: 100,
            });
          } else {
            // Остальное время: цена растет к TP
            allCandles.push({
              timestamp,
              open: basePrice + 500,
              high: basePrice + 600,
              low: basePrice + 400,
              close: basePrice + 500,
              volume: 100,
            });
          }
        }

        const price = await getAveragePrice("BTCUSDT");
        return {
          position: "long",
          note: "Schedule lifecycle test",
          priceOpen: price - 100,
          priceTakeProfit: price + 1_000,
          priceStopLoss: price - 10_000,
          minuteEstimatedTime: 120,
        };
      }
      return null;
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        resolve(true);
      },
    },
  });

  addFrame({
    frameName: "1d-schedule-lifecycle",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-schedule-lifecycle",
    exchangeName: "binance-mock-schedule-lifecycle",
    frameName: "1d-schedule-lifecycle",
  });

  await awaiter;

  const stats = await Schedule.getData("BTCUSDT", "test-strategy-schedule-lifecycle");

  if (
    stats &&
    stats.totalScheduled === 1 &&
    scheduledCount === 1 &&
    stats.eventList.length >= 1 &&
    stats.eventList[0].action === "scheduled"
  ) {
    pass("Schedule tracks scheduled signal and emits onSchedule callback");
    return;
  }

  fail("Schedule did not track scheduled signal lifecycle correctly");

});
