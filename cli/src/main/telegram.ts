import { getArgs } from "../helpers/getArgs";
import { singleshot } from "functools-kit";
import cli from "../lib";
import notifyShutdown from "../utils/notifyShutdown";
import getEntry from "../helpers/getEntry";
import notifyKill from "../utils/notifyKill";

const BEFORE_EXIT_FN = singleshot(async () => {
  process.off("SIGINT", BEFORE_EXIT_FN);
  notifyShutdown();
  notifyKill();
  cli.telegramProviderService.disable();
});

export const listenGracefulShutdown = singleshot(() => {
  process.on("SIGINT", BEFORE_EXIT_FN);
})

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }
  const { values } = getArgs();
  if (!values.telegram) {
    return;
  }
  listenGracefulShutdown();
};

main();
