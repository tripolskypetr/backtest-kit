import { inject } from "../../core/di";
import BabelService from "./BabelService";
import TYPES from "../../core/types";
import LoggerService from "../base/LoggerService";
import ClientLoader from "../../../client/ClientLoader";
import { isObject, memoize, singleshot } from "functools-kit";
import ResolveService from "./ResolveService";
import { IMPORT_ALIAS } from "../../../config/alias";

const GET_ALIAS_EXPORTS_FN = (self: LoaderService) => {
  const instance = self.getInstance(self.resolveService.OVERRIDE_CONFIG_DIR);
  if (!instance.check("alias.module")) {
    return null;
  }
  const exports = instance.import("alias.module");
  return "default" in exports
    ? exports.default
    : exports;
}

const INIT_ALIAS_FN = (self: LoaderService) => {
  const alias = GET_ALIAS_EXPORTS_FN(self);
  if (!alias) {
    return;
  }
  if (!isObject(alias)) {
    return;
  }
  Object.assign(IMPORT_ALIAS, alias);
};

export class LoaderService {
  readonly babelService = inject<BabelService>(TYPES.babelService);
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly resolveService = inject<ResolveService>(TYPES.resolveService);

  getInstance = memoize(
    ([basePath]) => `${basePath}`,
    (basePath: string) =>
      new ClientLoader({
        babel: this.babelService,
        logger: this.loggerService,
        resolve: this.resolveService,
        path: basePath,
      }),
  );

  public import = (filePath: string, basePath = process.cwd()) => {
    this.loggerService.log("loaderService import", {
      filePath,
      basePath,
    });
    const instance = this.getInstance(basePath);
    return instance.import(filePath);
  };

  public check = async (filePath: string, basePath = process.cwd()) => {
    this.loggerService.log("loaderService check", {
      filePath,
      basePath,
    });
    const instance = this.getInstance(basePath);
    return instance.check(filePath);
  };

  init = singleshot(() => {
    this.loggerService.log("loaderService init");
    INIT_ALIAS_FN(this);
  });
}

export default LoaderService;
