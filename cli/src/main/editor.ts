import { serve } from "@backtest-kit/ui";
import open from "open";
import { getArgs } from "../helpers/getArgs";
import { getEnv } from "../helpers/getEnv";
import cli from "../lib";
import getEntry from "../helpers/getEntry";

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (!values.editor) {
    return;
  }

  if (values.pine) {
    console.warn("--editor and --pine are mutually exclusive. Use one at a time.");
    process.exit(1);
  }

  await cli.moduleConnectionService.loadModule("./editor.module");
  
  {
    await cli.exchangeSchemaService.addSchema();
  }

  const { CC_WWWROOT_HOST, CC_WWWROOT_PORT } = getEnv();
  const unServer = serve(CC_WWWROOT_HOST, CC_WWWROOT_PORT, cli.resolveService.PROJECT_ROOT_DIR);

  try {
    await open(`http://localhost:${CC_WWWROOT_PORT}?pine=1`);
  } finally {
    console.log(`Editor launched: http://localhost:${CC_WWWROOT_PORT}?pine=1`)
  }

  const beforeExit = () => {
    process.off("SIGINT", beforeExit)
    unServer();
    process.exit(0);
  }

  process.on("SIGINT", beforeExit);
};

main();
