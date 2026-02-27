import { transform, registerPlugin } from "@babel/standalone";
import pluginUMD from "@babel/plugin-transform-modules-umd";
import LoggerService from "../base/LoggerService";
import * as BacktestKit from "backtest-kit";
import { inject } from "../../../lib/core/di";
import TYPES from "../../../lib/core/types";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { getArgs } from "../../../helpers/getArgs";

registerPlugin("plugin-transform-modules-umd", pluginUMD);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BacktestKitCli = new Proxy({}, {
  get(_target, prop) {
    throw new Error(`@backtest-kit/cli is not available in this context (accessed: ${String(prop)})`);
  },
});


declare global {
  interface Window {
    BacktestKit: typeof BacktestKit;
    BacktestKitCli: typeof BacktestKitCli
  }
}

export class BabelService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  readonly _require = createRequire(import.meta.url);

  public transpile = (code: string) => {
    this.loggerService.log("babelService transpile", { codeLen: code.length });
    const { values } = getArgs();
    const result = transform(code, {
      filename: "index.ts",
      presets: ["env", "typescript"],
      plugins: [
        [
          "plugin-transform-modules-umd",
          {
            globals: {
              "backtest-kit": "BacktestKit",
            },
            moduleId: "Executor",
          },
        ],
      ],
      parserOpts: { strictMode: false },
    });
    if (!result.code) {
      throw new Error("BabelService transpile failed");
    }
    if (values.debug) {
      fs.writeFileSync("./debug.js", result.code);
    }
    return result.code;
  };

  public transpileAndRun = (code: string) => {
    this.loggerService.log("babelService transpileAndRun", {
      codeLen: code.length,
    });
    const module = { exports: {} as Record<string, unknown> };
    const exports = module.exports;
    const require = (id: string) => {
      if (id === "backtest-kit") {
        return globalThis.BacktestKit;
      }
      if (id === "@backtest-kit/cli") {
        return globalThis.BacktestKitCli;
      }
      return this._require(id);
    };
    eval(this.transpile(code));
    return {
        require,
        __filename,
        __dirname,
        exports,
        module,
    }
  };
}

globalThis.BacktestKit = BacktestKit;
globalThis.BacktestKitCli = BacktestKitCli;

export default BabelService;
