import { getEntrySubject, getReadySubject } from "./emitters";

const CLI_SYMBOL = Symbol.for("backtest-kit-cli");

const main = () => {
  const entrySubject = getEntrySubject();
  entrySubject.subscribe(async (path) => {
    console.log("Running", path);
    await getReadySubject().next();
  });
  Object.assign(globalThis, { [CLI_SYMBOL]: 1 });
};

main();
