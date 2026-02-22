import { memoize } from "functools-kit";
import { createRequire } from "module";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ResolveService from "../base/ResolveService";
import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import {
  BaseModule,
  TBaseModuleCtor,
} from "../../../interfaces/Module.interface";

const require = createRequire(import.meta.url);

const getExtVariants = (fileName: string): string[] => {
  const ext = path.extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  return [fileName, `${base}.cjs`, `${base}.mjs`];
};

const REQUIRE_MODULE_FACTORY = (
  fileName: string,
): TBaseModuleCtor | BaseModule | null => {
  for (const variant of getExtVariants(fileName)) {
    try {
      return require(variant);
    } catch {
      continue;
    }
  }
  return null;
};

const IMPORT_MODULE_FACTORY = async (
  fileName: string,
): Promise<TBaseModuleCtor | BaseModule | null> => {
  for (const variant of getExtVariants(fileName)) {
    try {
      return await import(variant);
    } catch {
      continue;
    }
  }
  return null;
};

const LOAD_MODULE_MODULE_FN = async (
  fileName: string,
  self: ModuleConnectionService,
): Promise<BaseModule> => {
  let Ctor: TBaseModuleCtor | BaseModule | null = null;
  const overridePath = path.join(
    self.resolveService.OVERRIDE_MODULES_DIR,
    fileName,
  );
  const targetPath = path.join(process.cwd(), "modules", fileName);
  const hasOverride = await fs
    .access(overridePath, constants.F_OK | constants.R_OK)
    .then(() => true)
    .catch(() => false);
  const resolvedFile = hasOverride ? overridePath : targetPath;
  if ((Ctor = REQUIRE_MODULE_FACTORY(resolvedFile))) {
    return typeof Ctor === "function" ? new Ctor() : Ctor;
  }
  if ((Ctor = await IMPORT_MODULE_FACTORY(resolvedFile))) {
    return typeof Ctor === "function" ? new Ctor() : Ctor;
  }
  throw new Error(`Module module import failed for file: ${resolvedFile}`);
};

export class ModuleConnectionService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly resolveService = inject<ResolveService>(TYPES.resolveService);

  public getInstance = memoize(
    ([fileName]) => `${fileName}`,
    async (fileName: string): Promise<BaseModule> => {
      this.loggerService.log("moduleConnectionService getInstance", {
        fileName,
      });
      return await LOAD_MODULE_MODULE_FN(fileName, this);
    },
  );
}

export default ModuleConnectionService;
