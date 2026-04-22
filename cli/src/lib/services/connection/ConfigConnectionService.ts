import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ResolveService from "../base/ResolveService";
import LoaderService from "../base/LoaderService";
import path from "path";
import { ModuleExports } from "../../../model/Module.model";

const GET_CONFIG_VARIANTS_FN = (
  fileName: string,
  self: ConfigConnectionService,
) => {
  const result: {filePath: string; baseDir: string}[] = [];

  result.push({
    filePath: path.join(process.cwd(), "config", fileName),
    baseDir: path.join(process.cwd(), "config")
  })

  result.push({
    filePath: path.join(self.resolveService.OVERRIDE_CONFIG_DIR, fileName),
    baseDir: self.resolveService.OVERRIDE_CONFIG_DIR,
  })

  result.push({
    filePath: path.join(self.resolveService.DEFAULT_CONFIG_DIR, fileName),
    baseDir: self.resolveService.DEFAULT_CONFIG_DIR,
  })

  return result;
};

const LOAD_CONFIG_CONFIG_FN = async (
  fileName: string,
  self: ConfigConnectionService,
): Promise<ModuleExports> => {
  for (const {filePath, baseDir} of GET_CONFIG_VARIANTS_FN(fileName, self)) {
    try {
      if (await self.loaderService.check(filePath, baseDir)) {
        return self.loaderService.import(filePath, baseDir);
      }
    } catch {
      console.warn(`Module module import failed filePath=${filePath} baseDir=${baseDir}`);
      process.exit(-1);
    }
  }
  return null;
};

export class ConfigConnectionService {
    readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    readonly resolveService = inject<ResolveService>(TYPES.resolveService);
    readonly loaderService = inject<LoaderService>(TYPES.loaderService);

    public loadConfig = (fileName: string) => {
        this.loggerService.log("configConnectionService loadConfig", {
            fileName,
        });
        return LOAD_CONFIG_CONFIG_FN(fileName, this);
    }
}

export default ConfigConnectionService;
