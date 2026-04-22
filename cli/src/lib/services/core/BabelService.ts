import { transform, registerPlugin } from "@babel/standalone";
import pluginUMD from "@babel/plugin-transform-modules-umd";
import LoggerService from "../base/LoggerService";
import { inject } from "../../core/di";
import TYPES from "../../core/types";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { getArgs } from "../../../helpers/getArgs";
import { IBabel } from "../../../interfaces/Babel.interface";

registerPlugin("plugin-transform-modules-umd", pluginUMD);

export class BabelService implements IBabel {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

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
              "@backtest-kit/ui": "BacktestKitUi",
              "@backtest-kit/graph": "BacktestKitGraph",
              "@backtest-kit/ollama": "BacktestKitOllama",
              "@backtest-kit/pinets": "BacktestKitPinets",
              "@backtest-kit/signals": "BacktestKitSignals",
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
}

export default BabelService;
