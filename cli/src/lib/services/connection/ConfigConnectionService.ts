import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ResolveService from "../core/ResolveService";
import LoaderService from "../core/LoaderService";
import path from "path";
import { ModuleExports } from "../../../model/Module.model";
import { memoize } from "functools-kit";

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

  public hasConfig = (fileName: string) => {
    this.loggerService.log("configConnectionService hasConfig", {
      fileName,
    });
    return this.loadConfig.has(fileName);
  }

  public loadConfig = memoize(
    ([fileName]) => `${fileName}`,
    async (fileName: string) => {
      this.loggerService.log("configConnectionService loadConfig", {
        fileName,
      });
      const config = await LOAD_CONFIG_CONFIG_FN(fileName, this);
      if (!config) {
        this.loadConfig.clear(fileName);
        return null;
      }
      if ("default" in config) {
        return config.default;
      }
      return config;
    }
  );
}

export default ConfigConnectionService;
