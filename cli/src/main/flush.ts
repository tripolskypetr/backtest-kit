import { rm } from "fs/promises";
import { join, resolve, dirname } from "path";
import { getArgs, getPositionals } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";

const FLUSH_DIRS = ["report", "log", "markdown", "agent"];

export const flush = async (entryPoint: string) => {
  const moduleRoot = dirname(resolve(process.cwd(), entryPoint));
  const dumpDir = join(moduleRoot, "dump");

  for (const dir of FLUSH_DIRS) {
    const target = join(dumpDir, dir);
    await rm(target, { recursive: true, force: true });
    console.log(`Removed: ${target}`);
  }
};

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (!values.flush) {
    return;
  }

  const entryPoints = getPositionals();

  if (!entryPoints.length) {
    throw new Error("Entry point is required");
  }

  for (const entryPoint of entryPoints) {
    await flush(entryPoint);
  }

  process.exit(0);
};

main();
