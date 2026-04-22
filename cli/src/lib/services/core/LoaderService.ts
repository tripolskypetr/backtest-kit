import { inject } from "../../core/di";
import BabelService from "./BabelService";
import TYPES from "../../core/types";
import LoggerService from "../base/LoggerService";
import ClientLoader from "../../../client/ClientLoader";
import { memoize } from "functools-kit";
import ResolveService from "./ResolveService";

export class LoaderService {
  private readonly babelService = inject<BabelService>(TYPES.babelService);
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly resolveService = inject<ResolveService>(TYPES.resolveService);

  private getInstance = memoize(
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
}

export default LoaderService;
