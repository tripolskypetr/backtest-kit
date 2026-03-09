import { transform, registerPlugin } from "@babel/standalone";
import pluginUMD from "@babel/plugin-transform-modules-umd";
import LoggerService from "../base/LoggerService";
import * as BacktestKit from "backtest-kit";
import * as BacktestKitUi from "@backtest-kit/ui";
import * as BacktestKitGraph from "@backtest-kit/graph";
import * as BacktestKitOllama from "@backtest-kit/ollama";
import * as BacktestKitPinets from "@backtest-kit/pinets";
import * as BacktestKitSignals from "@backtest-kit/signals";
import { inject } from "../../../lib/core/di";
import TYPES from "../../../lib/core/types";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { getArgs } from "../../../helpers/getArgs";
import { singleshot } from "functools-kit";

registerPlugin("plugin-transform-modules-umd", pluginUMD);

const getBaseRequire = singleshot(() => {
  const baseRequire = createRequire(path.join(process.cwd(), "index.cjs"));
  return new Proxy(baseRequire, {
    apply(_target, _this, args) {
      const id = args[0];
      if (id === "backtest-kit") return globalThis.BacktestKit;
      if (id === "@backtest-kit/cli") return globalThis.BacktestKitCli;
      if (id === "@backtest-kit/ui") return globalThis.BacktestKitUi;
      if (id === "@backtest-kit/graph") return globalThis.BacktestKitGraph;
      if (id === "@backtest-kit/ollama") return globalThis.BacktestKitOllama;
      if (id === "@backtest-kit/pinets") return globalThis.BacktestKitPinets;
      if (id === "@backtest-kit/signals") return globalThis.BacktestKitSignals;
      return baseRequire(id);
    },
  });
});

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
    BacktestKitCli: typeof BacktestKitCli;
    BacktestKitUi: typeof BacktestKitUi;
    BacktestKitGraph: typeof BacktestKitGraph;
    BacktestKitOllama: typeof BacktestKitOllama;
    BacktestKitPinets: typeof BacktestKitPinets;
    BacktestKitSignals: typeof BacktestKitSignals;
  }
}

export class BabelService {
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

  public transpileAndRun = (code: string) => {
    this.loggerService.log("babelService transpileAndRun", {
      codeLen: code.length,
    });
    const require = getBaseRequire();
    const module = { exports: {} as Record<string, unknown> };
    const exports = module.exports;
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
globalThis.BacktestKitUi = BacktestKitUi;
globalThis.BacktestKitGraph = BacktestKitGraph;
globalThis.BacktestKitOllama = BacktestKitOllama;
globalThis.BacktestKitPinets = BacktestKitPinets;
globalThis.BacktestKitSignals = BacktestKitSignals;

export default BabelService;
