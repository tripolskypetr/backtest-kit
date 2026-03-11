import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ResolveService from "../base/ResolveService";
import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import LoaderService from "../base/LoaderService";

const LOAD_MODULE_MODULE_FN = async (
  fileName: string,
  self: ModuleConnectionService,
): Promise<boolean> => {
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
  try {
    await fs.access(resolvedFile, constants.F_OK | constants.R_OK)
    self.loaderService.import(resolvedFile);
    return true;
  } catch {
    console.warn(`Module module import failed for file: ${resolvedFile}`);
    return false;
  }
};

export class ModuleConnectionService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly resolveService = inject<ResolveService>(TYPES.resolveService);
  readonly loaderService = inject<LoaderService>(TYPES.loaderService);

  public loadModule = async (fileName: string) => {
    this.loggerService.log("moduleConnectionService getInstance", {
      fileName,
    });
    return await LOAD_MODULE_MODULE_FN(fileName, this);
  };
}

export default ModuleConnectionService;
