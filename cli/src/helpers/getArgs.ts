import { singleshot } from "functools-kit";
import { parseArgs } from "util";

const DEFAULT_SYMBOL = "BTCUSDT";

export const getArgs = singleshot(() => {
  const { values, positionals } = parseArgs({
    args: process.argv,
    options: {
      symbol: {
        type: "string",
        default: DEFAULT_SYMBOL,
      },
      strategy: {
        type: "string",
        default: "",
      },
      exchange: {
        type: "string",
        default: "",
      },
      frame: {
        type: "string",
        default: "",
      },
      backtest: {
        type: "boolean",
        default: false,
      },
      live: {
        type: "boolean",
        default: false,
      },
      paper: {
        type: "boolean",
        default: false,
      },
    },
    strict: false,
    allowPositionals: true,
  });
  return {
    values,
    positionals,
  }
});
