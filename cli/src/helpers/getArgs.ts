import { singleshot } from "functools-kit";
import { parseArgs } from "util";

const ALLOWED_EXTENSIONS = [
  `.cjs`,
  `.mjs`,
  `.ts`,
  `.tsx`,
  `.js`,
  `.pine`,
];

const DISALLOWED_PATHS = [
  "node_modules",
  "@backtest-kit",
];

export const getArgs = singleshot(() => {
  const { values, positionals } = parseArgs({
    args: process.argv,
    options: {
      // backtest entry
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
      walker: {
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
      debug: {
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
      // pinescript entry
      pine: {
        type: "boolean",
        default: false,
      },
      dump: {
        type: "boolean",
        default: false,
      },
      timeframe: {
        type: "string",
        default: "",
      },
      limit: {
        type: "string",
        default: "",
      },
      when: {
        type: "string",
        default: "",
      },
      output: {
        type: "string",
        default: "",
      },
      json: {
        type: "boolean",
        default: false,
      },
      jsonl: {
        type: "boolean",
        default: false,
      },
      markdown: {
        type: "boolean",
        default: false,
      },
      init: {
        type: "boolean",
        default: false,
      },
      help: {
        type: "boolean",
        default: false,
      },
      version: {
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
  };
});

export const getPositionals = singleshot((): string[] => {
  const { positionals = [] } = getArgs();
  return positionals
    .filter((value) => !DISALLOWED_PATHS.some((path) => value.includes(path)))
    .filter((value) =>
      ALLOWED_EXTENSIONS.some((ext) => value.endsWith(ext)),
    );
});
