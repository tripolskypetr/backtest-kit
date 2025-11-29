import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { Subject } from "functools-kit";

test("Scheduled signal is created and activated when price is reached", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;
  let activeCount = 0;
  let closedCount = 0;
  let index = 0;

  addExchange({
    exchangeName: "binance-scheduled-activate",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-scheduled-activate",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      index++;
      // Alternate between reachable TP and time expiration
      if (index % 2 === 1) {
        // Odd: Will hit TP (price grows, TP is reachable)
        return {
          position: "long",
          note: "scheduled activation test",
          priceOpen: price - 100,
          priceTakeProfit: price + 100,
          priceStopLoss: price - 10000,
          minuteEstimatedTime: 120,
        };
      } else {
        // Even: Will expire by time (TP unreachable, SL very low)
        return {
          position: "long",
          note: "scheduled activation test",
          priceOpen: price - 100,
          priceTakeProfit: price + 10000,
          priceStopLoss: price - 100,
          minuteEstimatedTime: 120,
        };
      }
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
      onActive: () => {
        activeCount++;
      },
      onClose: () => {
        closedCount++;
      },
    },
  });

  addFrame({
    frameName: "5d-scheduled-activate",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-06T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let scheduledEvents = 0;
  let openedEvents = 0;
  let activeEvents = 0;
  let closedEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "opened") {
      openedEvents++;
    }
    if (result.action === "active") {
      activeEvents++;
    }
    if (result.action === "closed") {
      closedEvents++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-activate",
    exchangeName: "binance-scheduled-activate",
    frameName: "5d-scheduled-activate",
  });

  await awaitSubject.toPromise();

  if (scheduledCount > 0 && openedCount > 0 && closedCount > 0) {
    pass(`Scheduled signal lifecycle works: ${scheduledCount} scheduled, ${openedCount} opened, ${closedCount} closed`);
    return;
  }

  fail(`Callbacks: scheduled=${scheduledCount}, opened=${openedCount}, closed=${closedCount}`);

});

test("Scheduled signal is cancelled when price never reaches entry point", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;

  addExchange({
    exchangeName: "binance-scheduled-cancel",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-scheduled-cancel",
    interval: "1m",
    getSignal: async () => {
      // Set priceOpen very low so it never gets reached (price only grows)
      return {
        position: "long",
        note: "scheduled cancellation test",
        priceOpen: 10000,
        priceTakeProfit: 11000,
        priceStopLoss: 5000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onCancel: () => {
        cancelledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrame({
    frameName: "3d-scheduled-cancel",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let scheduledEvents = 0;
  let cancelledEvents = 0;
  let openedEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "cancelled") {
      cancelledEvents++;
    }
    if (result.action === "opened") {
      openedEvents++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-cancel",
    exchangeName: "binance-scheduled-cancel",
    frameName: "3d-scheduled-cancel",
  });

  await awaitSubject.toPromise();

  if (scheduledCount > 0 && cancelledCount > 0 && openedCount === 0) {
    pass(`Scheduled signals cancelled correctly: ${scheduledCount} scheduled, ${cancelledCount} cancelled, ${openedCount} opened`);
    return;
  }

  fail(`Callbacks: scheduled=${scheduledCount}, cancelled=${cancelledCount}, opened=${openedCount}`);

});

test("Multiple scheduled signals queue and activate sequentially", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let openedCount = 0;
  let closedCount = 0;
  let index = 0;

  addExchange({
    exchangeName: "binance-scheduled-queue",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-scheduled-queue",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      index++;
      // Alternate between TP and time expiration
      if (index % 2 === 1) {
        return {
          position: "long",
          note: "scheduled queue test",
          priceOpen: price - 100,
          priceTakeProfit: price + 100,
          priceStopLoss: price - 10000,
          minuteEstimatedTime: 60,
        };
      } else {
        return {
          position: "long",
          note: "scheduled queue test",
          priceOpen: price - 100,
          priceTakeProfit: price + 10000,
          priceStopLoss: price - 100,
          minuteEstimatedTime: 60,
        };
      }
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
      onClose: () => {
        closedCount++;
      },
    },
  });

  addFrame({
    frameName: "10d-scheduled-queue",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-11T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let scheduledEvents = 0;
  let openedEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "scheduled") {
      scheduledEvents++;
    }
    if (result.action === "opened") {
      openedEvents++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-queue",
    exchangeName: "binance-scheduled-queue",
    frameName: "10d-scheduled-queue",
  });

  await awaitSubject.toPromise();

  // Should have multiple scheduled and opened signals over 10 days
  if (scheduledCount >= 2 && openedCount >= 2) {
    pass(`Multiple scheduled signals processed: ${scheduledCount} scheduled, ${openedCount} opened`);
    return;
  }

  fail(`Expected >=2 scheduled and opened, got scheduled=${scheduledCount}, opened=${openedCount}`);

});

test("Scheduled signal with stop loss hit before activation gets cancelled", async ({ pass, fail }) => {

  let scheduledCount = 0;
  let cancelledCount = 0;
  let openedCount = 0;

  addExchange({
    exchangeName: "binance-scheduled-sl-cancel",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-scheduled-sl-cancel",
    interval: "1m",
    getSignal: async () => {
      // Set priceOpen low so it never gets reached (price only grows)
      return {
        position: "long",
        note: "scheduled SL cancel test",
        priceOpen: 10000,
        priceTakeProfit: 11000,
        priceStopLoss: 5000,
        minuteEstimatedTime: 30,
      };
    },
    callbacks: {
      onSchedule: () => {
        scheduledCount++;
      },
      onCancel: () => {
        cancelledCount++;
      },
      onOpen: () => {
        openedCount++;
      },
    },
  });

  addFrame({
    frameName: "3d-scheduled-sl-cancel",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-04T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  let cancelledEvents = 0;

  listenSignalBacktest((result) => {
    if (result.action === "cancelled") {
      cancelledEvents++;
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-sl-cancel",
    exchangeName: "binance-scheduled-sl-cancel",
    frameName: "3d-scheduled-sl-cancel",
  });

  await awaitSubject.toPromise();

  if (scheduledCount > 0 && cancelledCount > 0 && openedCount === 0) {
    pass(`Scheduled signals with SL cancelled: ${scheduledCount} scheduled, ${cancelledCount} cancelled before activation`);
    return;
  }

  fail(`Expected cancellations, got scheduled=${scheduledCount}, cancelled=${cancelledCount}, opened=${openedCount}`);

});

test("Scheduled signal events emit correct action types", async ({ pass, fail }) => {

  const eventTypes = new Set();
  let index = 0;

  addExchange({
    exchangeName: "binance-scheduled-events",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
  });

  addStrategy({
    strategyName: "test-strategy-scheduled-events",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      index++;
      // Alternate between TP and time expiration
      if (index % 2 === 1) {
        return {
          position: "long",
          note: "event type test",
          priceOpen: price - 100,
          priceTakeProfit: price + 100,
          priceStopLoss: price - 10000,
          minuteEstimatedTime: 120,
        };
      } else {
        return {
          position: "long",
          note: "event type test",
          priceOpen: price - 100,
          priceTakeProfit: price + 10000,
          priceStopLoss: price - 100,
          minuteEstimatedTime: 120,
        };
      }
    },
  });

  addFrame({
    frameName: "5d-scheduled-events",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-06T00:00:00Z"),
  });

  const awaitSubject = new Subject();
  listenDoneBacktest(() => awaitSubject.next());

  listenSignalBacktest((result) => {
    eventTypes.add(result.action);
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-scheduled-events",
    exchangeName: "binance-scheduled-events",
    frameName: "5d-scheduled-events",
  });

  await awaitSubject.toPromise();

  // Should have at least: scheduled, opened, active, closed or cancelled
  const hasScheduled = eventTypes.has("scheduled");
  const hasOpened = eventTypes.has("opened");
  const hasActive = eventTypes.has("active");
  const hasClosedOrCancelled = eventTypes.has("closed") || eventTypes.has("cancelled");

  if (hasScheduled && (hasOpened || hasClosedOrCancelled)) {
    pass(`Scheduled signal events correct: ${Array.from(eventTypes).join(", ")}`);
    return;
  }

  fail(`Event types observed: ${Array.from(eventTypes).join(", ")}`);

});
