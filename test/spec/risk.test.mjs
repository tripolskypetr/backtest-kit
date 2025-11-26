import { test } from "worker-testbed";

import {
  addRisk,
  lib,
} from "../../build/index.mjs";

test("addRisk registers risk profile successfully", async ({ pass, fail }) => {

  addRisk({
    riskName: "test-basic-risk",
    note: "Basic risk profile for testing",
  });

  pass("Risk profile registered successfully");

});

test("addRisk throws on duplicate risk name", async ({ pass, fail }) => {

  addRisk({
    riskName: "test-duplicate-risk",
  });

  try {
    addRisk({
      riskName: "test-duplicate-risk",
    });
    fail("Did not throw error on duplicate risk name");
  } catch (error) {
    if (error.message.includes("already exist")) {
      pass("Correctly threw error on duplicate risk name");
      return;
    }
    fail(`Unexpected error message: ${error.message}`);
  }

});

test("Risk validation rejects signal when activePositionCount exceeds limit", async ({ pass, fail }) => {

  let rejectedSymbol = null;
  let rejectedReason = null;

  addRisk({
    riskName: "test-max-positions",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 3) {
            throw new Error("Maximum 3 concurrent positions allowed");
          }
        },
        note: "Limit concurrent positions to 3",
      },
    ],
    callbacks: {
      onRejected: (symbol, reason) => {
        rejectedSymbol = symbol;
        rejectedReason = reason;
      },
    },
  });

  // Simulate strategy with risk check
  const { riskGlobalService } = lib;

  // First 3 signals should pass
  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-max-positions" });
  await riskGlobalService.addSignal("ETHUSDT", { strategyName: "test-strategy-2", riskName: "test-max-positions" });
  await riskGlobalService.addSignal("BNBUSDT", { strategyName: "test-strategy-3", riskName: "test-max-positions" });

  // 4th signal should fail
  const result = await riskGlobalService.checkSignal(
    {
      symbol: "SOLUSDT",
      strategyName: "test-strategy-4",
      exchangeName: "binance",
      currentPrice: 100,
      timestamp: Date.now(),
    },
    { riskName: "test-max-positions" }
  );

  if (!result && rejectedSymbol === "SOLUSDT" && rejectedReason.includes("Maximum 3 concurrent positions")) {
    pass("Risk validation correctly rejected 4th position");
    return;
  }

  fail(`Expected rejection but got result: ${result}, symbol: ${rejectedSymbol}, reason: ${rejectedReason}`);

});

test("Risk validation allows signal when within limits", async ({ pass, fail }) => {

  let allowedSymbol = null;

  addRisk({
    riskName: "test-allow-positions",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          if (activePositionCount >= 5) {
            throw new Error("Maximum 5 concurrent positions allowed");
          }
        },
        note: "Limit concurrent positions to 5",
      },
    ],
    callbacks: {
      onAllowed: (symbol) => {
        allowedSymbol = symbol;
      },
    },
  });

  const { riskGlobalService } = lib;

  // Add 2 positions
  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-allow-positions" });
  await riskGlobalService.addSignal("ETHUSDT", { strategyName: "test-strategy-2", riskName: "test-allow-positions" });

  // 3rd signal should pass
  const result = await riskGlobalService.checkSignal(
    {
      symbol: "BNBUSDT",
      strategyName: "test-strategy-3",
      exchangeName: "binance",
      currentPrice: 300,
      timestamp: Date.now(),
    },
    { riskName: "test-allow-positions" }
  );

  if (result && allowedSymbol === "BNBUSDT") {
    pass("Risk validation correctly allowed signal within limits");
    return;
  }

  fail(`Expected approval but got result: ${result}, allowedSymbol: ${allowedSymbol}`);

});

test("Risk addSignal and removeSignal update activePositionCount", async ({ pass, fail }) => {

  let finalCount = -1;

  addRisk({
    riskName: "test-count-tracking",
    validations: [
      {
        validate: ({ activePositionCount }) => {
          finalCount = activePositionCount;
        },
        note: "Track position count",
      },
    ],
  });

  const { riskGlobalService } = lib;

  // Add 3 signals
  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-count-tracking" });
  await riskGlobalService.addSignal("ETHUSDT", { strategyName: "test-strategy-2", riskName: "test-count-tracking" });
  await riskGlobalService.addSignal("BNBUSDT", { strategyName: "test-strategy-3", riskName: "test-count-tracking" });

  // Check count is 3
  await riskGlobalService.checkSignal(
    {
      symbol: "SOLUSDT",
      strategyName: "test-strategy-4",
      exchangeName: "binance",
      currentPrice: 100,
      timestamp: Date.now(),
    },
    { riskName: "test-count-tracking" }
  );

  if (finalCount !== 3) {
    fail(`Expected count 3 after adding 3 signals, got ${finalCount}`);
    return;
  }

  // Remove 1 signal
  await riskGlobalService.removeSignal("ETHUSDT", { strategyName: "test-strategy-2", riskName: "test-count-tracking" });

  // Check count is 2
  await riskGlobalService.checkSignal(
    {
      symbol: "DOGEUSDT",
      strategyName: "test-strategy-5",
      exchangeName: "binance",
      currentPrice: 0.1,
      timestamp: Date.now(),
    },
    { riskName: "test-count-tracking" }
  );

  if (finalCount === 2) {
    pass("addSignal and removeSignal correctly update activePositionCount");
    return;
  }

  fail(`Expected count 2 after removing 1 signal, got ${finalCount}`);

});

test("Risk validation with function (not object) works", async ({ pass, fail }) => {

  let validationCalled = false;

  addRisk({
    riskName: "test-function-validation",
    validations: [
      async ({ symbol, activePositionCount }) => {
        validationCalled = true;
        if (activePositionCount >= 2) {
          throw new Error("Max 2 positions");
        }
      },
    ],
  });

  const { riskGlobalService } = lib;

  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-function-validation" });

  const result = await riskGlobalService.checkSignal(
    {
      symbol: "ETHUSDT",
      strategyName: "test-strategy-2",
      exchangeName: "binance",
      currentPrice: 2000,
      timestamp: Date.now(),
    },
    { riskName: "test-function-validation" }
  );

  if (validationCalled && result) {
    pass("Function validation (not object) works correctly");
    return;
  }

  fail(`Validation called: ${validationCalled}, result: ${result}`);

});

test("Risk validation receives all IRiskCheckArgs fields", async ({ pass, fail }) => {

  let receivedPayload = null;

  addRisk({
    riskName: "test-payload-fields",
    validations: [
      async (payload) => {
        receivedPayload = payload;
      },
    ],
  });

  const { riskGlobalService } = lib;

  const testArgs = {
    symbol: "BTCUSDT",
    strategyName: "test-strategy",
    exchangeName: "binance",
    currentPrice: 50000,
    timestamp: 1234567890,
  };

  await riskGlobalService.checkSignal(testArgs, { riskName: "test-payload-fields" });

  if (
    receivedPayload &&
    receivedPayload.symbol === testArgs.symbol &&
    receivedPayload.strategyName === testArgs.strategyName &&
    receivedPayload.exchangeName === testArgs.exchangeName &&
    receivedPayload.currentPrice === testArgs.currentPrice &&
    receivedPayload.timestamp === testArgs.timestamp &&
    typeof receivedPayload.activePositionCount === "number"
  ) {
    pass("Validation receives all IRiskCheckArgs fields plus activePositionCount");
    return;
  }

  fail(`Invalid payload received: ${JSON.stringify(receivedPayload)}`);

});

test("Risk validation can reject based on symbol", async ({ pass, fail }) => {

  let rejectedSymbol = null;

  addRisk({
    riskName: "test-symbol-filter",
    validations: [
      ({ symbol }) => {
        if (symbol === "DOGEUSDT") {
          throw new Error("DOGE trading not allowed");
        }
      },
    ],
    callbacks: {
      onRejected: (symbol) => {
        rejectedSymbol = symbol;
      },
    },
  });

  const { riskGlobalService } = lib;

  // BTC should pass
  const btcResult = await riskGlobalService.checkSignal(
    {
      symbol: "BTCUSDT",
      strategyName: "test-strategy",
      exchangeName: "binance",
      currentPrice: 50000,
      timestamp: Date.now(),
    },
    { riskName: "test-symbol-filter" }
  );

  // DOGE should fail
  const dogeResult = await riskGlobalService.checkSignal(
    {
      symbol: "DOGEUSDT",
      strategyName: "test-strategy",
      exchangeName: "binance",
      currentPrice: 0.1,
      timestamp: Date.now(),
    },
    { riskName: "test-symbol-filter" }
  );

  if (btcResult && !dogeResult && rejectedSymbol === "DOGEUSDT") {
    pass("Risk validation can filter by symbol");
    return;
  }

  fail(`BTC result: ${btcResult}, DOGE result: ${dogeResult}, rejected: ${rejectedSymbol}`);

});

test("Risk with no validations always allows signals", async ({ pass, fail }) => {

  addRisk({
    riskName: "test-no-validations",
  });

  const { riskGlobalService } = lib;

  const result = await riskGlobalService.checkSignal(
    {
      symbol: "BTCUSDT",
      strategyName: "test-strategy",
      exchangeName: "binance",
      currentPrice: 50000,
      timestamp: Date.now(),
    },
    { riskName: "test-no-validations" }
  );

  if (result) {
    pass("Risk with no validations allows all signals");
    return;
  }

  fail("Risk with no validations should allow signals");

});

test("Risk activePositionCount is isolated per riskName", async ({ pass, fail }) => {

  let risk1Count = -1;
  let risk2Count = -1;

  addRisk({
    riskName: "test-isolation-1",
    validations: [
      ({ activePositionCount }) => {
        risk1Count = activePositionCount;
      },
    ],
  });

  addRisk({
    riskName: "test-isolation-2",
    validations: [
      ({ activePositionCount }) => {
        risk2Count = activePositionCount;
      },
    ],
  });

  const { riskGlobalService } = lib;

  // Add 2 signals to risk1
  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-isolation-1" });
  await riskGlobalService.addSignal("ETHUSDT", { strategyName: "test-strategy-2", riskName: "test-isolation-1" });

  // Add 1 signal to risk2
  await riskGlobalService.addSignal("BNBUSDT", { strategyName: "test-strategy-3", riskName: "test-isolation-2" });

  // Check risk1 count
  await riskGlobalService.checkSignal(
    {
      symbol: "SOLUSDT",
      strategyName: "test-strategy-4",
      exchangeName: "binance",
      currentPrice: 100,
      timestamp: Date.now(),
    },
    { riskName: "test-isolation-1" }
  );

  // Check risk2 count
  await riskGlobalService.checkSignal(
    {
      symbol: "ADAUSDT",
      strategyName: "test-strategy-5",
      exchangeName: "binance",
      currentPrice: 0.5,
      timestamp: Date.now(),
    },
    { riskName: "test-isolation-2" }
  );

  if (risk1Count === 2 && risk2Count === 1) {
    pass("activePositionCount is correctly isolated per riskName");
    return;
  }

  fail(`Expected risk1: 2, risk2: 1, got risk1: ${risk1Count}, risk2: ${risk2Count}`);

});

test("Risk removeSignal with same strategyName:symbol key", async ({ pass, fail }) => {

  let finalCount = -1;

  addRisk({
    riskName: "test-remove-by-key",
    validations: [
      ({ activePositionCount }) => {
        finalCount = activePositionCount;
      },
    ],
  });

  const { riskGlobalService } = lib;

  // Add signal
  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-remove-by-key" });

  // Check count is 1
  await riskGlobalService.checkSignal(
    {
      symbol: "ETHUSDT",
      strategyName: "test-strategy-2",
      exchangeName: "binance",
      currentPrice: 2000,
      timestamp: Date.now(),
    },
    { riskName: "test-remove-by-key" }
  );

  if (finalCount !== 1) {
    fail(`Expected count 1 after adding signal, got ${finalCount}`);
    return;
  }

  // Remove signal by same strategyName and symbol
  await riskGlobalService.removeSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-remove-by-key" });

  // Check count is 0
  await riskGlobalService.checkSignal(
    {
      symbol: "BNBUSDT",
      strategyName: "test-strategy-3",
      exchangeName: "binance",
      currentPrice: 300,
      timestamp: Date.now(),
    },
    { riskName: "test-remove-by-key" }
  );

  if (finalCount === 0) {
    pass("removeSignal correctly removes by strategyName:symbol key");
    return;
  }

  fail(`Expected count 0 after removing signal, got ${finalCount}`);

});
