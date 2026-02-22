import { IPublicAction } from "backtest-kit";
import { memoize } from "functools-kit";
import { createRequire } from "module";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ResolveService from "../base/ResolveService";
import fs from "fs/promises";
import { constants } from "fs";
import path from "path";

const require = createRequire(import.meta.url);

type TPublicActionCtor = new () => IPublicAction;

const REQUIRE_MODULE_FACTORY = (
  fileName: string,
): TPublicActionCtor | IPublicAction | null => {
  try {
    return require(fileName);
  } catch {
    return null;
  }
};

const IMPORT_MODULE_FACTORY = async (
  fileName: string,
): Promise<TPublicActionCtor | IPublicAction | null> => {
  try {
    return await import(fileName);
  } catch {
    return null;
  }
};

const LOAD_MODULE_MODULE_FN = async (
  fileName: string,
  self: ModuleConnectionService,
): Promise<IPublicAction> => {
  let Ctor: TPublicActionCtor | IPublicAction | null = null;
  const overridePath = path.join(
    self.resolveService.OVERRIDE_MODULES_DIR,
    fileName,
  );
  const targetPath = path.join(
    process.cwd(),
    "modules",
    fileName,
  );
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
    async (fileName: string): Promise<IPublicAction> => {
      return await LOAD_MODULE_MODULE_FN(fileName, this);
    },
  );
}

export default ModuleConnectionService;
