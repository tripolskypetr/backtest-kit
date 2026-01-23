import fs from "fs/promises";
import { join } from "path";
import { inject } from "src/lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "src/lib/core/types";
import { memoize } from "functools-kit";

const READ_FILE_FN = memoize(
  ([filePath]) => filePath,
  async (filePath: string) => {
    const fileContent = await fs.readFile(filePath, "utf-8");
    return fileContent;
  },
);

export class PineCacheService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public readFile = async (
    path: string,
    baseDir = join(process.cwd(), "config/source"),
  ) => {
    this.loggerService.log("pineCacheService readFile", {
      path,
      baseDir,
    });
    const filePath = join(baseDir, path);
    return await READ_FILE_FN(filePath);
  };

  public clear = async (
    path?: string,
    baseDir = join(process.cwd(), "config/source"),
  ) => {
    this.loggerService.log("pineCacheService clear", {
      path,
      baseDir,
    });
    if (path) {
      const filePath = join(baseDir, path);
      READ_FILE_FN.clear(filePath);
      return;
    }
    READ_FILE_FN.clear();
  };
}

export default PineCacheService;
