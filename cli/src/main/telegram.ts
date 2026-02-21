import { getArgs } from "../helpers/getArgs";
import { singleshot } from "functools-kit";
import cli from "../lib";
import notifyShutdown from "../utils/notifyShutdown";

const BEFORE_EXIT_FN = singleshot(async () => {
  process.off("SIGINT", BEFORE_EXIT_FN);
  notifyShutdown();
  cli.telegramProviderService.disable();
});

export const main = async () => {
  const { values } = getArgs();
  if (!values.telegram) {
    return;
  }
  process.on("SIGINT", BEFORE_EXIT_FN);
};

main();
