import { singleshot } from "functools-kit";
import { parseArgs } from "util";

export const getArgs = singleshot(() => {
  const { values, positionals } = parseArgs({
    args: process.argv,
    options: {
      symbol: {
        type: "string",
        default: "",
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
      ui: {
        type: "boolean",
        default: false,
      },
      telegram: {
        type: "boolean",
        default: false,
      },
      verbose: {
        type: "boolean",
        default: false,
      },
      noCache: {
        type: "boolean",
        default: false,
      },
      cacheInterval: {
        type: "string",
        default: "1m, 15m, 30m, 4h",
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
