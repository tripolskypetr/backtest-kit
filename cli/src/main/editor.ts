import { serve } from "@backtest-kit/ui";
import open from "open";
import { getArgs } from "../helpers/getArgs";
import { getEnv } from "../helpers/getEnv";
import cli from "../lib";
import getEntry from "../helpers/getEntry";
import { Setup } from "../classes/Setup";
import path from "path";
import dotenv from "dotenv";
import { kill } from "../utils/notifyKill";

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
    kill();
  }

  await cli.configConnectionService.loadConfig("setup.config");

  {
    const loader = await cli.configConnectionService.loadConfig("loader.config");
    try {
      if (typeof loader === "function") {
        await loader();
      }
      if (typeof loader?.loader === "function") {
        await loader.loader();
      }
    } catch (error) {
      console.error("Module loader failed", error);
      kill();
    }
  }

  {
    await cli.configService.waitForInit();
    Setup.enable();
  }

  {
    const cwd = process.cwd();
    dotenv.config({ path: path.join(cwd, '.env'), override: true, quiet: true });
  }

  await cli.moduleConnectionService.loadModule("editor.module");
  
  {
    await cli.exchangeSchemaService.addSchema();
  }

  const { CC_WWWROOT_HOST, CC_WWWROOT_PORT } = getEnv();
  const unServer = serve(CC_WWWROOT_HOST, CC_WWWROOT_PORT, cli.resolveService.PROJECT_ROOT_DIR);

  let isOk = true;

  try {
    await open(`http://localhost:${CC_WWWROOT_PORT}?pine=1`);
    isOk = true;
  } catch {
    void 0;
  } finally {
    isOk && console.log(`Editor launched: http://localhost:${CC_WWWROOT_PORT}?pine=1`)
  }

  const beforeExit = () => {
    process.off("SIGINT", beforeExit)
    unServer();
    kill();
  }

  process.on("SIGINT", beforeExit);
};

main();
