import { test } from "worker-testbed";

import {
  addOptimizerSchema,
  Optimizer,
} from "../../build/index.mjs";

import { createAwaiter } from "functools-kit";

test("Optimizer.getData returns strategy data", async ({ pass, fail }) => {

  addOptimizerSchema({
    optimizerName: "test-optimizer-data",
    rangeTrain: [
      {
        note: "Train period 1",
        startDate: new Date("2024-01-01T00:00:00Z"),
        endDate: new Date("2024-01-02T00:00:00Z"),
      },
    ],
    rangeTest: {
      note: "Test period",
      startDate: new Date("2024-01-03T00:00:00Z"),
      endDate: new Date("2024-01-04T00:00:00Z"),
    },
    source: [
      async ({ symbol, startDate, endDate, limit, offset }) => {
        // Mock data source
        return [
          { id: "1", price: 50000, timestamp: startDate.getTime() },
          { id: "2", price: 51000, timestamp: endDate.getTime() },
        ];
      },
    ],
    getPrompt: async (symbol, messages) => {
      return `Mock strategy for ${symbol}`;
    },
  });

  const data = await Optimizer.getData("BTCUSDT", {
    optimizerName: "test-optimizer-data",
  });

  if (data && data.length > 0 && data[0].strategy) {
    pass("Optimizer.getData returned strategy data");
    return;
  }

  fail("Optimizer.getData did not return valid strategy data");

});

test("Optimizer.getCode generates executable code", async ({ pass, fail }) => {

  addOptimizerSchema({
    optimizerName: "test-optimizer-code",
    rangeTrain: [
      {
        note: "Train period 1",
        startDate: new Date("2024-01-01T00:00:00Z"),
        endDate: new Date("2024-01-02T00:00:00Z"),
      },
    ],
    rangeTest: {
      note: "Test period",
      startDate: new Date("2024-01-03T00:00:00Z"),
      endDate: new Date("2024-01-04T00:00:00Z"),
    },
    source: [
      async ({ symbol, startDate, endDate, limit, offset }) => {
        // Mock data source
        return [
          { id: "1", price: 50000, timestamp: startDate.getTime() },
          { id: "2", price: 51000, timestamp: endDate.getTime() },
        ];
      },
    ],
    getPrompt: async (symbol, messages) => {
      return `Mock strategy for ${symbol}`;
    },
  });

  const code = await Optimizer.getCode("BTCUSDT", {
    optimizerName: "test-optimizer-code",
  });

  // Check if code contains expected sections
  const hasImports = code.includes("import");
  const hasAddStrategy = code.includes("addStrategy");
  const hasWalker = code.includes("Walker.background");

  if (hasImports && hasAddStrategy && hasWalker) {
    pass("Optimizer.getCode generated executable code");
    return;
  }

  fail("Optimizer.getCode did not generate valid code");

});

test("Optimizer with custom template overrides", async ({ pass, fail }) => {

  addOptimizerSchema({
    optimizerName: "test-optimizer-custom",
    rangeTrain: [
      {
        note: "Train period 1",
        startDate: new Date("2024-01-01T00:00:00Z"),
        endDate: new Date("2024-01-02T00:00:00Z"),
      },
    ],
    rangeTest: {
      note: "Test period",
      startDate: new Date("2024-01-03T00:00:00Z"),
      endDate: new Date("2024-01-04T00:00:00Z"),
    },
    source: [
      async ({ symbol, startDate, endDate, limit, offset }) => {
        return [
          { id: "1", price: 50000, timestamp: startDate.getTime() },
        ];
      },
    ],
    getPrompt: async (symbol, messages) => {
      return `Custom strategy for ${symbol}`;
    },
    template: {
      getUserMessage: async (symbol, data, name) => {
        return `Custom user message for ${symbol}`;
      },
      getAssistantMessage: async (symbol, data, name) => {
        return "Custom assistant response";
      },
    },
  });

  const data = await Optimizer.getData("BTCUSDT", {
    optimizerName: "test-optimizer-custom",
  });

  // Check if custom template was used
  const hasCustomUserMessage = data[0].messages.some(
    (msg) => msg.role === "user" && msg.content.includes("Custom user message")
  );

  if (hasCustomUserMessage) {
    pass("Optimizer used custom template overrides");
    return;
  }

  fail("Optimizer did not use custom template");

});

test("Optimizer with multiple training ranges", async ({ pass, fail }) => {

  addOptimizerSchema({
    optimizerName: "test-optimizer-multi-range",
    rangeTrain: [
      {
        note: "Train period 1",
        startDate: new Date("2024-01-01T00:00:00Z"),
        endDate: new Date("2024-01-02T00:00:00Z"),
      },
      {
        note: "Train period 2",
        startDate: new Date("2024-02-01T00:00:00Z"),
        endDate: new Date("2024-02-02T00:00:00Z"),
      },
      {
        note: "Train period 3",
        startDate: new Date("2024-03-01T00:00:00Z"),
        endDate: new Date("2024-03-02T00:00:00Z"),
      },
    ],
    rangeTest: {
      note: "Test period",
      startDate: new Date("2024-04-01T00:00:00Z"),
      endDate: new Date("2024-04-02T00:00:00Z"),
    },
    source: [
      async ({ symbol, startDate, endDate, limit, offset }) => {
        return [
          { id: `${startDate.getTime()}`, price: 50000, timestamp: startDate.getTime() },
        ];
      },
    ],
    getPrompt: async (symbol, messages) => {
      return `Strategy for ${symbol}`;
    },
  });

  const data = await Optimizer.getData("BTCUSDT", {
    optimizerName: "test-optimizer-multi-range",
  });

  // Should generate 3 strategies (one per training range)
  if (data.length === 3) {
    pass("Optimizer generated strategies for all training ranges");
    return;
  }

  fail(`Optimizer generated ${data.length} strategies, expected 3`);

});

test("Optimizer with callbacks", async ({ pass, fail }) => {

  const [awaiter, { resolve }] = createAwaiter();
  let dataCallbackCalled = false;
  let codeCallbackCalled = false;

  addOptimizerSchema({
    optimizerName: "test-optimizer-callbacks",
    rangeTrain: [
      {
        note: "Train period 1",
        startDate: new Date("2024-01-01T00:00:00Z"),
        endDate: new Date("2024-01-02T00:00:00Z"),
      },
    ],
    rangeTest: {
      note: "Test period",
      startDate: new Date("2024-01-03T00:00:00Z"),
      endDate: new Date("2024-01-04T00:00:00Z"),
    },
    source: [
      async ({ symbol, startDate, endDate, limit, offset }) => {
        return [
          { id: "1", price: 50000, timestamp: startDate.getTime() },
        ];
      },
    ],
    getPrompt: async (symbol, messages) => {
      return `Strategy for ${symbol}`;
    },
    callbacks: {
      onData: async (symbol, strategyData) => {
        dataCallbackCalled = true;
      },
      onCode: async (symbol, code) => {
        codeCallbackCalled = true;
        resolve({ dataCallbackCalled, codeCallbackCalled });
      },
    },
  });

  await Optimizer.getData("BTCUSDT", {
    optimizerName: "test-optimizer-callbacks",
  });

  await Optimizer.getCode("BTCUSDT", {
    optimizerName: "test-optimizer-callbacks",
  });

  const result = await awaiter;

  if (result.dataCallbackCalled && result.codeCallbackCalled) {
    pass("Optimizer callbacks were triggered");
    return;
  }

  fail("Optimizer callbacks were not triggered");

});

test("Optimizer with multiple sources", async ({ pass, fail }) => {

  addOptimizerSchema({
    optimizerName: "test-optimizer-multi-source",
    rangeTrain: [
      {
        note: "Train period 1",
        startDate: new Date("2024-01-01T00:00:00Z"),
        endDate: new Date("2024-01-02T00:00:00Z"),
      },
    ],
    rangeTest: {
      note: "Test period",
      startDate: new Date("2024-01-03T00:00:00Z"),
      endDate: new Date("2024-01-04T00:00:00Z"),
    },
    source: [
      {
        name: "source-1",
        fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
          return [
            { id: "1", price: 50000, timestamp: startDate.getTime() },
          ];
        },
      },
      {
        name: "source-2",
        fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
          return [
            { id: "2", volume: 1000, timestamp: startDate.getTime() },
          ];
        },
      },
    ],
    getPrompt: async (symbol, messages) => {
      return `Multi-source strategy for ${symbol}`;
    },
  });

  const data = await Optimizer.getData("BTCUSDT", {
    optimizerName: "test-optimizer-multi-source",
  });

  // Each source should generate user/assistant message pairs
  // 2 sources * 2 messages = 4 messages minimum
  if (data[0].messages.length >= 4) {
    pass("Optimizer processed multiple sources");
    return;
  }

  fail(`Optimizer generated ${data[0].messages.length} messages, expected at least 4`);

});

test("Optimizer error handling for missing optimizer", async ({ pass, fail }) => {

  try {
    await Optimizer.getData("BTCUSDT", {
      optimizerName: "non-existent-optimizer",
    });
    fail("Should have thrown error for missing optimizer");
  } catch (error) {
    if (error.message.includes("not found")) {
      pass("Optimizer threw error for missing optimizer");
      return;
    }
    fail("Optimizer threw unexpected error");
  }

});

test("Optimizer pagination with large dataset", async ({ pass, fail }) => {

  addOptimizerSchema({
    optimizerName: "test-optimizer-pagination",
    rangeTrain: [
      {
        note: "Train period 1",
        startDate: new Date("2024-01-01T00:00:00Z"),
        endDate: new Date("2024-01-02T00:00:00Z"),
      },
    ],
    rangeTest: {
      note: "Test period",
      startDate: new Date("2024-01-03T00:00:00Z"),
      endDate: new Date("2024-01-04T00:00:00Z"),
    },
    source: [
      async ({ symbol, startDate, endDate, limit, offset }) => {
        // Simulate paginated data (return different data based on offset)
        const data = [];
        for (let i = offset; i < offset + Math.min(limit, 10); i++) {
          data.push({
            id: `item-${i}`,
            price: 50000 + i,
            timestamp: startDate.getTime() + i * 1000,
          });
        }
        return data;
      },
    ],
    getPrompt: async (symbol, messages) => {
      return `Paginated strategy for ${symbol}`;
    },
  });

  const data = await Optimizer.getData("BTCUSDT", {
    optimizerName: "test-optimizer-pagination",
  });

  if (data && data.length > 0) {
    pass("Optimizer handled pagination correctly");
    return;
  }

  fail("Optimizer failed to handle pagination");

});
