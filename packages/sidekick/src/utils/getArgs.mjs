import { singleshot } from "functools-kit";
import { parseArgs } from "util";

export const getArgs = singleshot(() => {
  const { values } = parseArgs({
    args: process.argv,
    options: {
      strategy: {
        type: "string",
      },
      backtest: {
        type: "boolean",
      },
      paper: {
        type: "boolean",
      },
      live: {
        type: "boolean",
      },
    },
    strict: false,
    allowPositionals: true,
  });
  return values;
});
