import { join } from "path";
import { createRequire } from "module";
import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import { memoize } from "functools-kit";
import { PromptModel } from "../../../model/Prompt.model";
import { Module } from "../../../classes/Module";
import { Prompt } from "../../../classes/Prompt";

const require = createRequire(import.meta.url);

const REQUIRE_MODULE_FN = memoize(
  ([module]) => join(module.baseDir, module.path),
  (module: Module): PromptModel => {
    const modulePath = require.resolve(join(module.baseDir, module.path));
    return require(modulePath);
  },
);

export class PromptCacheService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public readModule = (module: Module): Prompt => {
    this.loggerService.log("promptCacheService readModule", {
      path: module.path,
      baseDir: module.baseDir,
    });
    const source = REQUIRE_MODULE_FN(module);
    return Prompt.fromPrompt(source);
  };

  public clear = (module?: Module) => {
    this.loggerService.log("promptCacheService clear", {
      module,
    });
    if (module) {
      REQUIRE_MODULE_FN.clear(join(module.baseDir, module.path));
      return;
    }
    REQUIRE_MODULE_FN.clear();
  };
}

export default PromptCacheService;
