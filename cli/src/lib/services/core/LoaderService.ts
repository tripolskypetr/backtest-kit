import { inject } from "../../core/di";
import BabelService from "./BabelService";
import TYPES from "../../core/types";
import LoggerService from "../base/LoggerService";
import ClientLoader from "../../../client/ClientLoader";
import { isObject, memoize, singleshot, trycatch } from "functools-kit";
import ResolveService from "./ResolveService";
import { IMPORT_ALIAS } from "../../../config/alias";
import { overrideModule } from "../../../helpers/overrideModule";
import path from "path";
import fs from "fs";
import { kill } from "../../../utils/notifyKill";

const GET_ALIAS_VARIANTS_FN = (self: LoaderService) => {
  const result: { filePath: string; baseDir: string }[] = [];

  result.push({
    filePath: path.join(self.resolveService.OVERRIDE_CONFIG_DIR, "alias.config.cjs"),
    baseDir: self.resolveService.OVERRIDE_CONFIG_DIR,
  });

  result.push({
    filePath: path.join(self.resolveService.OVERRIDE_CONFIG_DIR, "alias.config.mjs"),
    baseDir: self.resolveService.OVERRIDE_CONFIG_DIR,
  });

  result.push({
    filePath: path.join(self.resolveService.OVERRIDE_CONFIG_DIR, "alias.config.ts"),
    baseDir: self.resolveService.OVERRIDE_CONFIG_DIR,
  });

  result.push({
    filePath: path.join(self.resolveService.OVERRIDE_CONFIG_DIR, "alias.config.tsx"),
    baseDir: self.resolveService.OVERRIDE_CONFIG_DIR,
  });

  result.push({
    filePath: path.join(self.resolveService.OVERRIDE_CONFIG_DIR, "alias.config.js"),
    baseDir: self.resolveService.OVERRIDE_CONFIG_DIR,
  });

  result.push({
    filePath: path.join(self.resolveService.OVERRIDE_CONFIG_DIR, "alias.config.json"),
    baseDir: self.resolveService.OVERRIDE_CONFIG_DIR,
  });

  return result;
};

const ESM_IMPORT_FN = trycatch(
  async (name: string) => {
    const alias = await import(name);
    {
      overrideModule(name, alias);
      Object.assign(IMPORT_ALIAS, { [name]: alias });
    }
  }, 
  {
    fallback: (error, name) => {
      console.error(`Import failed for ${name}`, error);
    }
  }
);

const GET_ALIAS_EXPORTS_FN = (self: LoaderService) => {
  for (const { filePath, baseDir } of GET_ALIAS_VARIANTS_FN(self)) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const instance = self._getInstance(baseDir);
    const alias = instance.import(filePath);
    if (!alias) {
      return null;
    }
    if ("default" in alias) {
      return alias.default;
    }
    return alias;
  }
  return null;
};

const INIT_ALIAS_FN = singleshot(async (self: LoaderService) => {

  {
    await ESM_IMPORT_FN("ccxt");
    await ESM_IMPORT_FN("pinets");
  }

  const alias = GET_ALIAS_EXPORTS_FN(self);

  if (!alias) {
    return;
  }

  let moduleMap: Record<string, unknown>;

  try {
    if (isObject(alias)) {
      moduleMap = alias;
    } else if (typeof alias === "function") {
      moduleMap = await alias();
    } else if (typeof alias?.loader === "function") {
      moduleMap = await alias.loader();
    }
  } catch (error) {
    console.error("Alias loader failed", error);
    kill(-1);
    return;
  }

  if (!isObject(moduleMap)) {
    return;
  }

  {
    Object.entries(moduleMap).forEach(([name, module]) =>
      overrideModule(name, module),
    );
    Object.assign(IMPORT_ALIAS, moduleMap);
  }
});

export class LoaderService {
  readonly babelService = inject<BabelService>(TYPES.babelService);
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly resolveService = inject<ResolveService>(TYPES.resolveService);

  _getInstance = memoize(
    ([basePath]) => `${basePath}`,
    (basePath: string) => {
      return new ClientLoader({
        babel: this.babelService,
        logger: this.loggerService,
        resolve: this.resolveService,
        path: basePath,
      });
    },
  );

  public import = async (filePath: string, basePath = process.cwd()) => {
    this.loggerService.log("loaderService import", {
      filePath,
      basePath,
    });
    const instance = this._getInstance(basePath);
    await INIT_ALIAS_FN(this);
    return instance.import(filePath);
  };

  public check = async (filePath: string, basePath = process.cwd()) => {
    this.loggerService.log("loaderService check", {
      filePath,
      basePath,
    });
    const instance = this._getInstance(basePath);
    await INIT_ALIAS_FN(this);
    return instance.check(filePath);
  };
}

export default LoaderService;
