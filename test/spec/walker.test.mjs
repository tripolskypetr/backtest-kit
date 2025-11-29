import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  addWalker,
  Walker,
  listenWalker,
  listenWalkerOnce,
  listenWalkerComplete,
  emitters,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { createAwaiter } from "functools-kit";

test("listenWalker receives progress events for each strategy", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-walker-progress",
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
    strategyName: "test-strategy-walker-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker test 1",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addStrategy({
    strategyName: "test-strategy-walker-2",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker test 2",
        priceOpen: price,
        priceTakeProfit: price + 2_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-walker-progress",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addWalker({
    walkerName: "test-walker-progress",
    exchangeName: "binance-mock-walker-progress",
    frameName: "1d-backtest-walker-progress",
    strategies: ["test-strategy-walker-1", "test-strategy-walker-2"],
    metric: "sharpeRatio",
  });

  const events = [];

  const unsubscribe = listenWalker((event) => {
    events.push(event);
    if (event.strategiesTested === event.totalStrategies) {
      resolve(events);
      unsubscribe();
    }
  });

  Walker.background("BTCUSDT", {
    walkerName: "test-walker-progress",
  });

  const allEvents = await awaiter;

  if (allEvents && allEvents.length === 2) {
    pass(`Walker emitted ${allEvents.length} progress events`);
    return;
  }

  fail("Walker did not emit correct number of progress events");

});

test("listenWalkerOnce triggers once with filter", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-walker-once",
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
    strategyName: "test-strategy-walker-once-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker once test 1",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addStrategy({
    strategyName: "test-strategy-walker-once-2",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker once test 2",
        priceOpen: price,
        priceTakeProfit: price + 2_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-walker-once",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addWalker({
    walkerName: "test-walker-once",
    exchangeName: "binance-mock-walker-once",
    frameName: "1d-backtest-walker-once",
    strategies: ["test-strategy-walker-once-1", "test-strategy-walker-once-2"],
    metric: "sharpeRatio",
  });

  // Listen for specific strategy completion
  listenWalkerOnce(
    (event) => event.strategyName === "test-strategy-walker-once-2",
    (event) => {
      resolve(event);
    }
  );

  Walker.background("BTCUSDT", {
    walkerName: "test-walker-once",
  });

  const event = await awaiter;

  if (event && event.strategyName === "test-strategy-walker-once-2") {
    pass("listenWalkerOnce triggered for specific strategy");
    return;
  }

  fail("listenWalkerOnce did not trigger correctly");

});

test("listenWalkerComplete receives final results", async ({ pass, fail }) => {

  const [awaiter, { resolve, reject }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-walker-complete",
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
    strategyName: "test-strategy-walker-complete-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker complete test 1",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addStrategy({
    strategyName: "test-strategy-walker-complete-2",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker complete test 2",
        priceOpen: price,
        priceTakeProfit: price + 2_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-walker-complete",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addWalker({
    walkerName: "test-walker-complete",
    exchangeName: "binance-mock-walker-complete",
    frameName: "1d-backtest-walker-complete",
    strategies: ["test-strategy-walker-complete-1", "test-strategy-walker-complete-2"],
    metric: "winRate",
  });

  const unsubscribe = listenWalkerComplete((results) => {
    try {
      if (
        results &&
        results.walkerName === "test-walker-complete" &&
        results.totalStrategies === 2 &&
        results.bestStrategy !== null &&
        results.bestStats !== null
      ) {
        pass("listenWalkerComplete received final results with best strategy");
        resolve();
      } else {
        fail("listenWalkerComplete did not receive correct final results");
        reject();
      }
    } catch (error) {
      fail(`listenWalkerComplete threw error: ${error.message}`);
      reject();
    } finally {
      unsubscribe();
    }
  });

  // Run walker and consume results
  for await (const _ of Walker.run("BTCUSDT", {
    walkerName: "test-walker-complete",
  })) {
    // Just consume
  }

  await awaiter;

});

test("Walker progress events include strategy stats", async ({ pass, fail }) => {

  const [awaiter, { resolve, reject }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-walker-stats",
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
    strategyName: "test-strategy-walker-stats-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker stats test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-walker-stats",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addWalker({
    walkerName: "test-walker-stats",
    exchangeName: "binance-mock-walker-stats",
    frameName: "1d-backtest-walker-stats",
    strategies: ["test-strategy-walker-stats-1"],
    metric: "totalPnl",
  });

  const unsubscribe = listenWalker((event) => {
    if (event.strategiesTested === event.totalStrategies) {
      try {
        if (
          event &&
          event.stats &&
          typeof event.stats.sharpeRatio !== "undefined" &&
          typeof event.stats.winRate !== "undefined" &&
          typeof event.stats.totalPnl !== "undefined"
        ) {
          pass("Walker progress events include complete strategy statistics");
          resolve();
        } else {
          fail("Walker progress events missing strategy statistics");
          reject();
        }
      } finally {
        unsubscribe();
      }
    }
  });

  // Run walker and consume results
  for await (const _ of Walker.run("BTCUSDT", {
    walkerName: "test-walker-stats",
  })) {
    // Just consume
  }

  await awaiter;

});

test("Walker callbacks are called in correct order", async ({ pass, fail }) => {

  const [awaiter, { resolve, reject }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-walker-callbacks",
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
    strategyName: "test-strategy-walker-cb-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker callback test 1",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addStrategy({
    strategyName: "test-strategy-walker-cb-2",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker callback test 2",
        priceOpen: price,
        priceTakeProfit: price + 2_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-walker-callbacks",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  const callbackSequence = [];

  addWalker({
    walkerName: "test-walker-callbacks",
    exchangeName: "binance-mock-walker-callbacks",
    frameName: "1d-backtest-walker-callbacks",
    strategies: ["test-strategy-walker-cb-1", "test-strategy-walker-cb-2"],
    metric: "sharpeRatio",
    callbacks: {
      onStrategyStart: (strategyName, symbol) => {
        callbackSequence.push({ type: "start", strategyName, symbol });
      },
      onStrategyComplete: (strategyName, symbol, stats, metricValue) => {
        callbackSequence.push({ type: "complete", strategyName, metricValue });
      },
      onComplete: (results) => {
        callbackSequence.push({ type: "finalComplete", bestStrategy: results.bestStrategy });
        if (
          callbackSequence.length === 5 && // 2 starts + 2 completes + 1 final complete
          callbackSequence[0].type === "start" &&
          callbackSequence[1].type === "complete" &&
          callbackSequence[2].type === "start" &&
          callbackSequence[3].type === "complete" &&
          callbackSequence[4].type === "finalComplete"
        ) {
          pass("Walker callbacks called in correct order");
          resolve();
        } else {
          fail("Walker callbacks not called in correct order");
          reject();
        }
      },
    },
  });

  // Run walker and consume results
  for await (const _ of Walker.run("BTCUSDT", {
    walkerName: "test-walker-callbacks",
  })) {
    // Just consume
  }

  await awaiter;

});

test("Walker.getData returns accumulated results", async ({ pass, fail }) => {

  const [awaiter, { resolve, reject }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-walker-getdata",
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
    strategyName: "test-strategy-walker-getdata-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker getData test 1",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addStrategy({
    strategyName: "test-strategy-walker-getdata-2",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker getData test 2",
        priceOpen: price,
        priceTakeProfit: price + 2_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-walker-getdata",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addWalker({
    walkerName: "test-walker-getdata",
    exchangeName: "binance-mock-walker-getdata",
    frameName: "1d-backtest-walker-getdata",
    strategies: ["test-strategy-walker-getdata-1", "test-strategy-walker-getdata-2"],
    metric: "avgPnl",
    callbacks: {
      onComplete: async (results) => {
        try {
          const data = await Walker.getData(
            "BTCUSDT",
            "test-walker-getdata"
          );
          if (
            data &&
            data.walkerName === "test-walker-getdata" &&
            data.symbol === "BTCUSDT" &&
            data.metric === "avgPnl" &&
            data.totalStrategies === 2 &&
            data.bestStrategy !== null
          ) {
            pass("Walker.getData returns accumulated results");
            resolve();
          } else {
            fail("Walker.getData did not return correct results");
            reject();
          }
        } catch (error) {
          fail(`Walker.getData threw error: ${error.message}`);
          reject();
        }
      },
    },
  });

  // Run walker and consume results
  for await (const _ of Walker.run("BTCUSDT", {
    walkerName: "test-walker-getdata",
  })) {
    // Just consume
  }

  await awaiter;

});

test("Walker tracks best strategy correctly", async ({ pass, fail }) => {

  const [awaiter, { resolve, reject }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-walker-best",
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
    strategyName: "test-strategy-walker-best-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker best test 1",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addStrategy({
    strategyName: "test-strategy-walker-best-2",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker best test 2",
        priceOpen: price,
        priceTakeProfit: price + 2_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-walker-best",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addWalker({
    walkerName: "test-walker-best",
    exchangeName: "binance-mock-walker-best",
    frameName: "1d-backtest-walker-best",
    strategies: ["test-strategy-walker-best-1", "test-strategy-walker-best-2"],
    metric: "sharpeRatio",
  });

  const progressEvents = [];

  const unsubscribe = listenWalker((event) => {
    progressEvents.push({
      strategyName: event.strategyName,
      metricValue: event.metricValue,
      bestStrategy: event.bestStrategy,
      bestMetric: event.bestMetric,
    });

    if (event.strategiesTested === event.totalStrategies) {
      try {
        if (progressEvents && progressEvents.length === 2) {
          // Check that bestStrategy and bestMetric are tracked across events
          const firstEvent = progressEvents[0];
          const secondEvent = progressEvents[1];

          if (
            firstEvent.bestStrategy !== null &&
            secondEvent.bestStrategy !== null &&
            (secondEvent.bestMetric >= firstEvent.bestMetric || secondEvent.bestMetric === null)
          ) {
            pass("Walker tracks best strategy correctly across progress events");
            resolve();
          } else {
            fail("Walker did not track best strategy correctly");
            reject();
          }
        } else {
          fail("Walker did not track best strategy correctly");
          reject();
        }
      } finally {
        unsubscribe();
      }
    }
  });

  // Run walker and consume results
  for await (const _ of Walker.run("BTCUSDT", {
    walkerName: "test-walker-best",
  })) {
    // Just consume
  }

  await awaiter;

});

test("Walker.getReport generates markdown report", async ({ pass, fail }) => {

  const [awaiter, { resolve, reject }] = createAwaiter();

  addExchange({
    exchangeName: "binance-mock-walker-report",
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
    strategyName: "test-strategy-walker-report-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker report test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-walker-report",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addWalker({
    walkerName: "test-walker-report",
    exchangeName: "binance-mock-walker-report",
    frameName: "1d-backtest-walker-report",
    strategies: ["test-strategy-walker-report-1"],
    metric: "certaintyRatio",
    callbacks: {
      onComplete: async (results) => {
        try {
          const report = await Walker.getReport(
            "BTCUSDT",
            "test-walker-report"
          );
          if (
            report &&
            typeof report === "string" &&
            report.includes("Walker Comparison Report") &&
            report.includes("test-walker-report") &&
            report.includes("Best Strategy")
          ) {
            pass("Walker.getReport generates markdown report");
            resolve();
          } else {
            fail("Walker.getReport did not generate correct markdown report");
            reject();
          }
        } catch (error) {
          fail(`Walker.getReport threw error: ${error.message}`);
          reject();
        }
      },
    },
  });

  // Run walker and consume results
  for await (const _ of Walker.run("BTCUSDT", {
    walkerName: "test-walker-report",
  })) {
    // Just consume
  }

  await awaiter;

});

test("doneWalkerSubject.toPromise() resolves after Walker.background", async ({ pass, fail }) => {

  addExchange({
    exchangeName: "binance-mock-walker-done-promise",
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
    strategyName: "test-strategy-walker-done-promise-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "walker done promise test",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrame({
    frameName: "1d-backtest-walker-done-promise",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addWalker({
    walkerName: "test-walker-done-promise",
    exchangeName: "binance-mock-walker-done-promise",
    frameName: "1d-backtest-walker-done-promise",
    strategies: ["test-strategy-walker-done-promise-1"],
    metric: "sharpeRatio",
  });

  // Create promise that will resolve when doneWalkerSubject emits
  const donePromise = emitters.doneWalkerSubject.toPromise();

  // Run walker in background
  Walker.background("BTCUSDT", {
    walkerName: "test-walker-done-promise",
  });

  try {
    // Wait for doneWalkerSubject to resolve
    const event = await donePromise;

    if (
      event &&
      event.strategyName === "test-walker-done-promise" &&
      event.symbol === "BTCUSDT" &&
      event.exchangeName === "binance-mock-walker-done-promise" &&
      event.backtest === true
    ) {
      pass("doneWalkerSubject.toPromise() resolved after Walker.background");
      return;
    }

    fail("doneWalkerSubject.toPromise() resolved with incorrect data");
  } catch (error) {
    fail(`doneWalkerSubject.toPromise() failed: ${error.message}`);
  }

});
