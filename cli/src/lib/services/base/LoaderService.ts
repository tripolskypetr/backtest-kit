import { inject } from "../../../lib/core/di";
import BabelService from "./BabelService";
import TYPES from "../../../lib/core/types";
import LoggerService from "./LoggerService";
import ClientLoader from "../../../client/ClientLoader";
import { memoize } from "functools-kit";

export class LoaderService {
  private readonly babelService = inject<BabelService>(TYPES.babelService);
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private getInstance = memoize(
    ([basePath]) => `${basePath}`,
    (basePath: string) =>
      new ClientLoader({
        babel: this.babelService,
        logger: this.loggerService,
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
}

export default LoaderService;
