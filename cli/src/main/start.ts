import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";

declare const __PACKAGE_VERSION__: string;

const MODES = ["backtest", "walker", "paper", "live", "pine", "dump", "init", "help", "version"] as const;

const ENTRY_PATH = "./node_modules/@backtest-kit/cli/build/index.mjs";

const HELP_TEXT = `
Example:

  node ${ENTRY_PATH} --help
`.trimStart();

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (MODES.some((mode) => values[mode])) {
    return;
  }

  process.stdout.write(`@backtest-kit/cli ${__PACKAGE_VERSION__}\n`);
  process.stdout.write("\n");
  process.stdout.write(`Run with --help to see available commands.\n`);
  process.stdout.write("\n");
  process.stdout.write(HELP_TEXT);
  process.exit(0);
};

main();
