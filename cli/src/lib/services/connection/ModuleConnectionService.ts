import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ResolveService from "../base/ResolveService";
import path from "path";
import LoaderService from "../base/LoaderService";

const GET_MODULE_VARIANTS_FN = (
  fileName: string,
  self: ModuleConnectionService,
) => {
  const result: {filePath: string; baseDir: string}[] = [];

  result.push({
    filePath: path.join(process.cwd(), "modules", fileName),
    baseDir: path.join(process.cwd(), "modules")
  })

  result.push({
    filePath: path.join(self.resolveService.OVERRIDE_MODULES_DIR, fileName),
    baseDir: self.resolveService.OVERRIDE_MODULES_DIR,
  })

  result.push({
    filePath: path.join(self.resolveService.DEFAULT_MODULES_DIR, fileName),
    baseDir: self.resolveService.DEFAULT_MODULES_DIR,
  })

  return result;
}

const LOAD_MODULE_MODULE_FN = async (
  fileName: string,
  self: ModuleConnectionService,
): Promise<boolean> => {
  for (const {filePath, baseDir} of GET_MODULE_VARIANTS_FN(fileName, self)) {
    try {
      if (await self.loaderService.check(filePath, baseDir)) {
        self.loaderService.import(filePath, baseDir);
        return true;
      }
    } catch {
      console.warn(`Module module import failed filePath=${filePath} baseDir=${baseDir}`);
      process.exit(-1);
    }
  }
  return false;
};

export class ModuleConnectionService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly resolveService = inject<ResolveService>(TYPES.resolveService);
  readonly loaderService = inject<LoaderService>(TYPES.loaderService);

  public loadModule = async (fileName: string) => {
    this.loggerService.log("moduleConnectionService loadModule", {
      fileName,
    });
    return await LOAD_MODULE_MODULE_FN(fileName, this);
  };
}

export default ModuleConnectionService;
