import { addOptimizer, Optimizer } from "backtest-kit";

addOptimizer({
  optimizerName: "btc-optimizer",
  
  rangeTrain: [
    {
      note: "Bull market Q1 2024",
      startDate: new Date("2024-01-01T00:00:00Z"),
      endDate: new Date("2024-03-31T23:59:59Z"),
    },
    {
      note: "Consolidation Q2 2024",
      startDate: new Date("2024-04-01T00:00:00Z"),
      endDate: new Date("2024-06-30T23:59:59Z"),
    },
  ],

  rangeTest: {
    note: "Validation Q3 2024",
    startDate: new Date("2024-07-01T00:00:00Z"),
    endDate: new Date("2024-09-30T23:59:59Z"),
  },

  source: [
    {
      name: "backtest-results",
      fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
        return [
            {
                id: 1,
                foo: "foo"
            }
        ]
      },
    },
    {
      name: "market-indicators",
      fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
        return [
            {
                id: 1,
                foo: "bar"
            }
        ]
      },
    },
  ],

  getPrompt: async (symbol, messages) => {
    return `
      Based on the historical data, create a strategy that:
      - Uses multi-timeframe analysis (1h, 15m, 5m, 1m)
      - Identifies high-probability entry points
      - Uses proper risk/reward ratios (min 1.5:1)
      - Adapts to market conditions
    `;
  },
});

await Optimizer.dump("BTCUSDT", {
  optimizerName: "btc-optimizer"
}, "./generated");