import { join } from "path";
import { createRequire } from "module";
import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import { memoize } from "functools-kit";
import { PromptModel } from "../../../model/Prompt.model";
import { Prompt } from "../../../classes/Prompt";
import { Code } from "../../../classes/Code";

const require = createRequire(import.meta.url);

const REQUIRE_MODULE_FN = memoize(
  ([modulePath]) => modulePath,
  (modulePath: string): PromptModel => {
    return require(modulePath);
  },
);

export class PromptCacheService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public readModule = (prompt: Prompt): Code => {
    this.loggerService.log("promptCacheService readModule", {
      path: prompt.path,
      baseDir: prompt.baseDir,
    });
    const modulePath = require.resolve(join(prompt.baseDir, prompt.path));
    const source = REQUIRE_MODULE_FN(modulePath);
    return Code.fromCode(source);
  };

  public clear = (prompt?: Prompt) => {
    this.loggerService.log("promptCacheService clear", {
      prompt,
    });
    if (prompt) {
      try {
        const modulePath = require.resolve(join(prompt.baseDir, prompt.path));
        REQUIRE_MODULE_FN.clear(modulePath);
        delete require.cache[modulePath];
      } catch {
        // Module not found, nothing to clear
      }
      return;
    }
    REQUIRE_MODULE_FN.clear();
  };
}

export default PromptCacheService;
