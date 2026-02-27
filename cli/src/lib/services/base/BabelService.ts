import { transform, registerPlugin } from "@babel/standalone";
import pluginCommonjs from "@babel/plugin-transform-modules-commonjs";
import LoggerService from "../base/LoggerService";
import * as BacktestKit from "backtest-kit";
import { inject } from "../../../lib/core/di";
import TYPES from "../../../lib/core/types";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

registerPlugin("plugin-transform-modules-commonjs", pluginCommonjs);

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BabelService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public transpile = (code: string) => {
    this.loggerService.log("babelService transpile", { codeLen: code.length });
    const result = transform(code, {
      filename: "index.ts",
      presets: ["env", "typescript"],
      plugins: ["plugin-transform-modules-commonjs"],
      parserOpts: { strictMode: false },
    });
    if (!result.code) {
      throw new Error("BabelService transpile failed");
    }
    return result.code;
  };

  public transpileAndRun = (code: string) => {
    this.loggerService.log("babelService transpileAndRun", {
      codeLen: code.length,
    });
    void require;
    void __filename;
    void __dirname;
    const module = { exports: {} as Record<string, unknown> };
    const exports = module.exports;
    eval(this.transpile(code));
    void exports;
    return module.exports;
  };
}

globalThis.BacktestKit = BacktestKit;

export default BabelService;
