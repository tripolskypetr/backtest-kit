import { test } from "worker-testbed";

import {
  addRisk,
  addExchange,
  lib,
  PersistRiskAdapter,
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


// Add mock exchange for all tests
addExchange({
  exchangeName: "binance",
  getCandles: async () => [],
  formatPrice: async (_symbol, p) => p.toFixed(8),
  formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
});

  // Simulate strategy with risk check
  const { riskGlobalService } = lib;

  // First 3 signals should pass
  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-max-positions", exchangeName: "binance", frameName: "", backtest: false });
  await riskGlobalService.addSignal("ETHUSDT", { strategyName: "test-strategy-2", riskName: "test-max-positions", exchangeName: "binance", frameName: "", backtest: false });
  await riskGlobalService.addSignal("BNBUSDT", { strategyName: "test-strategy-3", riskName: "test-max-positions", exchangeName: "binance", frameName: "", backtest: false });

  // 4th signal should fail
  const result = await riskGlobalService.checkSignal(
    {
      symbol: "SOLUSDT",
      strategyName: "test-strategy-4",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 100,
      timestamp: Date.now(),
    },
    { riskName: "test-max-positions", exchangeName: "binance", frameName: "", backtest: false }
  );

  if (!result && rejectedSymbol === "SOLUSDT" && rejectedReason && rejectedReason.symbol === "SOLUSDT") {
    pass("Risk validation correctly rejected 4th position");
    return;
  }

  fail(`Expected rejection but got result: ${result}, symbol: ${rejectedSymbol}, reason: ${JSON.stringify(rejectedReason)}`);

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


// Add mock exchange for all tests
addExchange({
  exchangeName: "binance",
  getCandles: async () => [],
  formatPrice: async (_symbol, p) => p.toFixed(8),
  formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
});

  const { riskGlobalService } = lib;

  // Add 2 positions
  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-allow-positions", exchangeName: "binance", frameName: "", backtest: false });
  await riskGlobalService.addSignal("ETHUSDT", { strategyName: "test-strategy-2", riskName: "test-allow-positions", exchangeName: "binance", frameName: "", backtest: false });

  // 3rd signal should pass
  const result = await riskGlobalService.checkSignal(
    {
      symbol: "BNBUSDT",
      strategyName: "test-strategy-3",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 300,
      timestamp: Date.now(),
    },
    { riskName: "test-allow-positions", exchangeName: "binance", frameName: "", backtest: false }
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


// Add mock exchange for all tests
addExchange({
  exchangeName: "binance",
  getCandles: async () => [],
  formatPrice: async (_symbol, p) => p.toFixed(8),
  formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
});

  const { riskGlobalService } = lib;

  // Add 3 signals
  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-count-tracking", exchangeName: "binance", frameName: "", backtest: false });
  await riskGlobalService.addSignal("ETHUSDT", { strategyName: "test-strategy-2", riskName: "test-count-tracking", exchangeName: "binance", frameName: "", backtest: false });
  await riskGlobalService.addSignal("BNBUSDT", { strategyName: "test-strategy-3", riskName: "test-count-tracking", exchangeName: "binance", frameName: "", backtest: false });

  // Check count is 3
  await riskGlobalService.checkSignal(
    {
      symbol: "SOLUSDT",
      strategyName: "test-strategy-4",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 100,
      timestamp: Date.now(),
    },
    { riskName: "test-count-tracking", exchangeName: "binance", frameName: "", backtest: false }
  );

  if (finalCount !== 3) {
    fail(`Expected count 3 after adding 3 signals, got ${finalCount}`);
    return;
  }

  // Remove 1 signal
  await riskGlobalService.removeSignal("ETHUSDT", { strategyName: "test-strategy-2", riskName: "test-count-tracking", exchangeName: "binance", frameName: "", backtest: false });

  // Check count is 2
  await riskGlobalService.checkSignal(
    {
      symbol: "DOGEUSDT",
      strategyName: "test-strategy-5",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 0.1,
      timestamp: Date.now(),
    },
    { riskName: "test-count-tracking", exchangeName: "binance", frameName: "", backtest: false }
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

// Add mock exchange for all tests
addExchange({
  exchangeName: "binance",
  getCandles: async () => [],
  formatPrice: async (_symbol, p) => p.toFixed(8),
  formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
});

  const { riskGlobalService } = lib;

  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-function-validation", exchangeName: "binance", frameName: "", backtest: false });

  const result = await riskGlobalService.checkSignal(
    {
      symbol: "ETHUSDT",
      strategyName: "test-strategy-2",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 2000,
      timestamp: Date.now(),
    },
    { riskName: "test-function-validation", exchangeName: "binance", frameName: "", backtest: false }
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


// Add mock exchange for all tests
addExchange({
  exchangeName: "binance",
  getCandles: async () => [],
  formatPrice: async (_symbol, p) => p.toFixed(8),
  formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
});

  const { riskGlobalService } = lib;

  const testArgs = {
    symbol: "BTCUSDT",
    strategyName: "test-strategy",
    pendingSignal: {},
    exchangeName: "binance",
    currentPrice: 50000,
    timestamp: 1234567890,
  };

  await riskGlobalService.checkSignal(testArgs, { riskName: "test-payload-fields", exchangeName: "binance", frameName: "", backtest: false });

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


// Add mock exchange for all tests
addExchange({
  exchangeName: "binance",
  getCandles: async () => [],
  formatPrice: async (_symbol, p) => p.toFixed(8),
  formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
});

  const { riskGlobalService } = lib;

  // BTC should pass
  const btcResult = await riskGlobalService.checkSignal(
    {
      symbol: "BTCUSDT",
      strategyName: "test-strategy",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 50000,
      timestamp: Date.now(),
    },
    { riskName: "test-symbol-filter", exchangeName: "binance", frameName: "", backtest: false }
  );

  // DOGE should fail
  const dogeResult = await riskGlobalService.checkSignal(
    {
      symbol: "DOGEUSDT",
      strategyName: "test-strategy",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 0.1,
      timestamp: Date.now(),
    },
    { riskName: "test-symbol-filter", exchangeName: "binance", frameName: "", backtest: false }
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


// Add mock exchange for all tests
addExchange({
  exchangeName: "binance",
  getCandles: async () => [],
  formatPrice: async (_symbol, p) => p.toFixed(8),
  formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
});

  const { riskGlobalService } = lib;

  const result = await riskGlobalService.checkSignal(
    {
      symbol: "BTCUSDT",
      strategyName: "test-strategy",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 50000,
      timestamp: Date.now(),
    },
    { riskName: "test-no-validations", exchangeName: "binance", frameName: "", backtest: false }
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


// Add mock exchange for all tests
addExchange({
  exchangeName: "binance",
  getCandles: async () => [],
  formatPrice: async (_symbol, p) => p.toFixed(8),
  formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
});

  const { riskGlobalService } = lib;

  // Add 2 signals to risk1
  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-isolation-1", exchangeName: "binance", frameName: "", backtest: false });
  await riskGlobalService.addSignal("ETHUSDT", { strategyName: "test-strategy-2", riskName: "test-isolation-1", exchangeName: "binance", frameName: "", backtest: false });

  // Add 1 signal to risk2
  await riskGlobalService.addSignal("BNBUSDT", { strategyName: "test-strategy-3", riskName: "test-isolation-2", exchangeName: "binance", frameName: "", backtest: false });

  // Check risk1 count
  await riskGlobalService.checkSignal(
    {
      symbol: "SOLUSDT",
      strategyName: "test-strategy-4",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 100,
      timestamp: Date.now(),
    },
    { riskName: "test-isolation-1", exchangeName: "binance", frameName: "", backtest: false }
  );

  // Check risk2 count
  await riskGlobalService.checkSignal(
    {
      symbol: "ADAUSDT",
      strategyName: "test-strategy-5",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 0.5,
      timestamp: Date.now(),
    },
    { riskName: "test-isolation-2", exchangeName: "binance", frameName: "", backtest: false }
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


// Add mock exchange for all tests
addExchange({
  exchangeName: "binance",
  getCandles: async () => [],
  formatPrice: async (_symbol, p) => p.toFixed(8),
  formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
});

  const { riskGlobalService } = lib;

  // Add signal
  await riskGlobalService.addSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-remove-by-key", exchangeName: "binance", frameName: "", backtest: false });

  // Check count is 1
  await riskGlobalService.checkSignal(
    {
      symbol: "ETHUSDT",
      strategyName: "test-strategy-2",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 2000,
      timestamp: Date.now(),
    },
    { riskName: "test-remove-by-key", exchangeName: "binance", frameName: "", backtest: false }
  );

  if (finalCount !== 1) {
    fail(`Expected count 1 after adding signal, got ${finalCount}`);
    return;
  }

  // Remove signal by same strategyName and symbol
  await riskGlobalService.removeSignal("BTCUSDT", { strategyName: "test-strategy-1", riskName: "test-remove-by-key", exchangeName: "binance", frameName: "", backtest: false });

  // Check count is 0
  await riskGlobalService.checkSignal(
    {
      symbol: "BNBUSDT",
      strategyName: "test-strategy-3",
      pendingSignal: {},
      exchangeName: "binance",
      currentPrice: 300,
      timestamp: Date.now(),
    },
    { riskName: "test-remove-by-key", exchangeName: "binance", frameName: "", backtest: false }
  );

  if (finalCount === 0) {
    pass("removeSignal correctly removes by strategyName:symbol key");
    return;
  }

  fail(`Expected count 0 after removing signal, got ${finalCount}`);

});

test("PersistRiskAdapter.readPositionData returns empty array when no data exists", async ({ pass, fail }) => {

  PersistRiskAdapter.usePersistRiskAdapter(class {
    async waitForInit() {}
    async readValue() {
      throw new Error("Not found");
    }
    async hasValue() {
      return false;
    }
    async writeValue() {}
  });

  const positions = await PersistRiskAdapter.readPositionData("test-risk-empty");

  if (Array.isArray(positions) && positions.length === 0) {
    pass("readPositionData returns empty array for new risk profile");
    return;
  }

  fail(`Expected empty array, got ${JSON.stringify(positions)}`);

});

test("PersistRiskAdapter.writePositionData and readPositionData persist data correctly", async ({ pass, fail }) => {

  let storedData = null;

  PersistRiskAdapter.usePersistRiskAdapter(class {
    async waitForInit() {}
    async readValue() {
      return storedData;
    }
    async hasValue() {
      return storedData !== null;
    }
    async writeValue(_key, value) {
      storedData = value;
    }
  });

  const testRiskName = "test-risk-persist";
  const testPositions = [
    ["strategy1:BTCUSDT", {
      signal: null,
      strategyName: "strategy1",
      exchangeName: "binance",
      openTimestamp: 1234567890,
    }],
    ["strategy2:ETHUSDT", {
      signal: null,
      strategyName: "strategy2",
      exchangeName: "binance",
      openTimestamp: 1234567900,
    }],
  ];

  // Write data
  await PersistRiskAdapter.writePositionData(testPositions, testRiskName);

  // Read data back
  const readPositions = await PersistRiskAdapter.readPositionData(testRiskName);

  if (
    Array.isArray(readPositions) &&
    readPositions.length === 2 &&
    readPositions[0][0] === "strategy1:BTCUSDT" &&
    readPositions[0][1].strategyName === "strategy1" &&
    readPositions[1][0] === "strategy2:ETHUSDT" &&
    readPositions[1][1].strategyName === "strategy2"
  ) {
    pass("writePositionData and readPositionData correctly persist and restore data");
    return;
  }

  fail(`Data mismatch. Read: ${JSON.stringify(readPositions)}`);

});

test("PersistRiskAdapter supports custom adapter", async ({ pass, fail }) => {

  let writeCalled = false;
  let readCalled = false;

  const mockPositions = [
    ["custom:BTCUSDT", {
      signal: null,
      strategyName: "custom-strategy",
      exchangeName: "custom-exchange",
      openTimestamp: 9999999,
    }],
  ];

  PersistRiskAdapter.usePersistRiskAdapter(class {
    async waitForInit() {
      // Mock initialization
    }
    async readValue() {
      readCalled = true;
      return mockPositions;
    }
    async hasValue() {
      return true;
    }
    async writeValue(key, value) {
      writeCalled = true;
      if (key === "positions" && Array.isArray(value)) {
        return;
      }
      throw new Error("Invalid write");
    }
  });

  // Test write
  await PersistRiskAdapter.writePositionData(mockPositions, "test-custom-adapter");

  // Test read
  const positions = await PersistRiskAdapter.readPositionData("test-custom-adapter");

  if (
    writeCalled &&
    readCalled &&
    positions.length === 1 &&
    positions[0][0] === "custom:BTCUSDT"
  ) {
    pass("Custom adapter works correctly");
    return;
  }

  fail(`Custom adapter failed. writeCalled: ${writeCalled}, readCalled: ${readCalled}`);

});

test("PersistRiskAdapter handles Map to Array conversion", async ({ pass, fail }) => {

  let storedData = null;

  PersistRiskAdapter.usePersistRiskAdapter(class {
    async waitForInit() {}
    async readValue() {
      return storedData;
    }
    async hasValue() {
      return storedData !== null;
    }
    async writeValue(_key, value) {
      storedData = value;
    }
  });

  const testRiskName = "test-risk-map-conversion";

  // Create a Map
  const positionsMap = new Map([
    ["strategy1:BTCUSDT", {
      signal: null,
      strategyName: "strategy1",
      exchangeName: "binance",
      openTimestamp: Date.now(),
    }],
    ["strategy2:ETHUSDT", {
      signal: null,
      strategyName: "strategy2",
      exchangeName: "binance",
      openTimestamp: Date.now(),
    }],
  ]);

  // Convert Map to Array and write
  const positionsArray = Array.from(positionsMap);
  await PersistRiskAdapter.writePositionData(positionsArray, testRiskName);

  // Read back
  const readPositions = await PersistRiskAdapter.readPositionData(testRiskName);

  // Convert back to Map
  const restoredMap = new Map(readPositions);

  if (
    restoredMap.size === 2 &&
    restoredMap.has("strategy1:BTCUSDT") &&
    restoredMap.has("strategy2:ETHUSDT") &&
    restoredMap.get("strategy1:BTCUSDT").strategyName === "strategy1" &&
    restoredMap.get("strategy2:ETHUSDT").strategyName === "strategy2"
  ) {
    pass("Map to Array conversion and restoration works correctly");
    return;
  }

  fail(`Map conversion failed. Restored size: ${restoredMap.size}`);

});

test("PersistRiskAdapter overwrites existing data", async ({ pass, fail }) => {

  let storedData = null;

  PersistRiskAdapter.usePersistRiskAdapter(class {
    async waitForInit() {}
    async readValue() {
      return storedData;
    }
    async hasValue() {
      return storedData !== null;
    }
    async writeValue(_key, value) {
      storedData = value;
    }
  });

  const testRiskName = "test-risk-overwrite";

  // Write initial data
  const initialPositions = [
    ["strategy1:BTCUSDT", {
      signal: null,
      strategyName: "strategy1",
      exchangeName: "binance",
      openTimestamp: 1111111,
    }],
  ];

  await PersistRiskAdapter.writePositionData(initialPositions, testRiskName);

  // Overwrite with new data
  const newPositions = [
    ["strategy2:ETHUSDT", {
      signal: null,
      strategyName: "strategy2",
      exchangeName: "binance",
      openTimestamp: 2222222,
    }],
    ["strategy3:BNBUSDT", {
      signal: null,
      strategyName: "strategy3",
      exchangeName: "binance",
      openTimestamp: 3333333,
    }],
  ];

  await PersistRiskAdapter.writePositionData(newPositions, testRiskName);

  // Read back
  const readPositions = await PersistRiskAdapter.readPositionData(testRiskName);

  if (
    readPositions.length === 2 &&
    readPositions[0][0] === "strategy2:ETHUSDT" &&
    readPositions[1][0] === "strategy3:BNBUSDT"
  ) {
    pass("PersistRiskAdapter correctly overwrites existing data");
    return;
  }

  fail(`Overwrite failed. Read: ${JSON.stringify(readPositions)}`);

});

test("PersistRiskAdapter isolates data by riskName", async ({ pass, fail }) => {

  // Storage per riskName - simulates how PersistBase would store data
  const storageByRisk = new Map();

  PersistRiskAdapter.usePersistRiskAdapter(class {
    constructor(riskName) {
      this.riskName = riskName;
    }

    async waitForInit() {
      // Initialize storage for this riskName if needed
      if (!storageByRisk.has(this.riskName)) {
        storageByRisk.set(this.riskName, new Map());
      }
    }

    async readValue(key) {
      const riskStorage = storageByRisk.get(this.riskName);
      if (!riskStorage) {
        throw new Error("Storage not initialized");
      }
      const data = riskStorage.get(key);
      if (!data) {
        throw new Error("Not found");
      }
      return data;
    }

    async hasValue(key) {
      const riskStorage = storageByRisk.get(this.riskName);
      if (!riskStorage) {
        return false;
      }
      return riskStorage.has(key);
    }

    async writeValue(key, value) {
      let riskStorage = storageByRisk.get(this.riskName);
      if (!riskStorage) {
        riskStorage = new Map();
        storageByRisk.set(this.riskName, riskStorage);
      }
      riskStorage.set(key, value);
    }
  });

  const risk1Data = [
    ["risk1:BTCUSDT", {
      signal: null,
      strategyName: "risk1-strategy",
      exchangeName: "binance",
      openTimestamp: 1111111,
    }],
  ];

  const risk2Data = [
    ["risk2:ETHUSDT", {
      signal: null,
      strategyName: "risk2-strategy",
      exchangeName: "binance",
      openTimestamp: 2222222,
    }],
  ];

  // Write to two different risk profiles
  await PersistRiskAdapter.writePositionData(risk1Data, "test-risk-isolation-1");
  await PersistRiskAdapter.writePositionData(risk2Data, "test-risk-isolation-2");

  // Read back both
  const read1 = await PersistRiskAdapter.readPositionData("test-risk-isolation-1");
  const read2 = await PersistRiskAdapter.readPositionData("test-risk-isolation-2");

  if (
    read1.length === 1 &&
    read2.length === 1 &&
    read1[0][0] === "risk1:BTCUSDT" &&
    read2[0][0] === "risk2:ETHUSDT"
  ) {
    pass("PersistRiskAdapter correctly isolates data by riskName");
    return;
  }

  fail(`Isolation failed. risk1: ${JSON.stringify(read1)}, risk2: ${JSON.stringify(read2)}`);

});
