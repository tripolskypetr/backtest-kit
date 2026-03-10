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

  public import = async (filePath: string, basePath = process.cwd()) => {
    this.loggerService.log("loaderService import", {
      filePath,
    });
    const instance = this.getInstance(basePath);
    return instance.import(filePath);
  };
}

export default LoaderService;
