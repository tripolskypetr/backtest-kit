import { getErrorMessage } from "functools-kit";
import { createRequire } from "module";
import { pathToFileURL } from "url";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ResolveService from "../base/ResolveService";
import BabelService from "../base/BabelService";
import fs from "fs/promises";
import { constants } from "fs";
import path from "path";

declare const __IS_ESM__: boolean;

const require = createRequire(import.meta.url);

const getExtVariants = (fileName: string): string[] => {
  const ext = path.extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  return [
    fileName,
    `${base}.cjs`,
    `${base}.mjs`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
  ];
};

const REQUIRE_MODULE_FACTORY = (fileName: string): boolean => {
  if (__IS_ESM__) {
    return false;
  }
  for (const variant of getExtVariants(fileName)) {
    try {
      require(variant);
      return true;
    } catch {
      continue;
    }
  }
  return false;
};

const IMPORT_MODULE_FACTORY = async (fileName: string): Promise<boolean> => {
  if (!__IS_ESM__) {
    return false;
  }
  for (const variant of getExtVariants(fileName)) {
    try {
      await import(pathToFileURL(variant).href);
      return true;
    } catch {
      continue;
    }
  }
  return false;
};

const BABEL_MODULE_FACTORY = async (
  fileName: string,
  self: ModuleConnectionService,
): Promise<boolean> => {
  for (const variant of getExtVariants(fileName)) {
    try {
      const code = await fs.readFile(variant, "utf-8");
      self.babelService.transpileAndRun(code);
      return true;
    } catch (error) {
      console.log(getErrorMessage(error));
      continue;
    }
  }
  return false;
};

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
  if (REQUIRE_MODULE_FACTORY(resolvedFile)) {
    return true;
  }
  if (await IMPORT_MODULE_FACTORY(resolvedFile)) {
    return true;
  }
  if (await BABEL_MODULE_FACTORY(resolvedFile, self)) {
    return true;
  }
  console.warn(`Module module import failed for file: ${resolvedFile}`);
  return false;
};

export class ModuleConnectionService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly resolveService = inject<ResolveService>(TYPES.resolveService);
  readonly babelService = inject<BabelService>(TYPES.babelService);

  public loadModule = async (fileName: string) => {
    this.loggerService.log("moduleConnectionService getInstance", {
      fileName,
    });
    return await LOAD_MODULE_MODULE_FN(fileName, this);
  };
}

export default ModuleConnectionService;
