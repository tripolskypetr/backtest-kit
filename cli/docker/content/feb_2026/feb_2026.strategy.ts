import {
  addStrategySchema,
} from "tradeforge";

addStrategySchema({
  strategyName: "feb_2026_strategy",
  getSignal: async (_symbol, when) => {
    console.log(when);
    return null;
  },
});
