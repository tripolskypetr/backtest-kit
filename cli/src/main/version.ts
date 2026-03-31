import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";

declare const __PACKAGE_VERSION__: string;

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (!values.version) {
    return;
  }

  process.stdout.write(`@backtest-kit/cli ${__PACKAGE_VERSION__}\n`);
  process.exit(0);
};

main();
