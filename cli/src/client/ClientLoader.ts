import path from "path";
import { createRequire } from "module";
import { getErrorMessage, singleshot } from "functools-kit";
import fs from "fs";

import { ILoader, ILoaderParams } from "../interfaces/Loader.interface";

import * as BacktestKit from "backtest-kit";
import * as BacktestKitUi from "@backtest-kit/ui";
import * as BacktestKitGraph from "@backtest-kit/graph";
import * as BacktestKitOllama from "@backtest-kit/ollama";
import * as BacktestKitPinets from "@backtest-kit/pinets";
import * as BacktestKitSignals from "@backtest-kit/signals";

declare const __IS_ESM__: boolean;

const TRANSPILE_FN = (code: string, self: ClientLoader) => {
  const require = self.getBaseRequire();
  const __filename = self.__filename;
  const __dirname = self.__dirname;
  const module = { exports: {} as Record<string, unknown> };
  const exports = module.exports;
  try {
    eval(self.params.babel.transpile(code));
  } catch (error) {
    console.log(
      `Error during transpilation error=\`${getErrorMessage(error)}\` __filename=\`${__filename}\` __dirname=\`${__dirname}\``,
    );
    process.exit(-1);
  }
  return {
    require,
    __filename,
    __dirname,
    exports,
    module,
  };
};

const REQUIRE_ENTRY_FACTORY = (filePath: string, self: ClientLoader) => {
  if (__IS_ESM__) {
    return null;
  }
  const baseRequire = self.getBaseRequire();
  try {
    return baseRequire(filePath);
  } catch {
    return null;
  }
};

const BABEL_ENTRY_FACTORY = (filePath: string, self: ClientLoader) => {
  try {
    const resolvedPath = path.resolve(self.__dirname, filePath);
    const code = fs.readFileSync(resolvedPath, "utf-8");
    const child = self.fork(path.dirname(resolvedPath));
    const { module } = TRANSPILE_FN(code, child);
    return "default" in module.exports
      ? module.exports.default
      : module.exports;
  } catch {
    return null;
  }
};

const GET_EXT_VARIANTS_FN = (fileName: string): string[] => {
  const ext = path.extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  const result: string[] = [];

  {
    result.push(`${base}`)
    result.push(`${base}.cjs`)
    result.push(`${base}.mjs`)
    result.push(`${base}.ts`)
    result.push(`${base}.tsx`)
    result.push(`${base}.js`)
    result.push(`${base}.json`)
  }

  {
    result.push(`${fileName}`)
    result.push(`${fileName}.cjs`)
    result.push(`${fileName}.mjs`)
    result.push(`${fileName}.ts`)
    result.push(`${fileName}.tsx`)
    result.push(`${fileName}.js`)
    result.push(`${fileName}.json`)
  }

  return result;
};

const GET_RESOLVED_EXT_FN = (filePath: string) => {
  for (const variant of GET_EXT_VARIANTS_FN(filePath)) {
    if (fs.existsSync(variant)) {
      return variant;
    }
  }
  return filePath;
};

const ENTRY_FACTORY = (filePath: string, self: ClientLoader) => {
  filePath = GET_RESOLVED_EXT_FN(filePath);
  {
    let result: any = null;
    if ((result = REQUIRE_ENTRY_FACTORY(filePath, self))) {
      return result;
    }
    if ((result = BABEL_ENTRY_FACTORY(filePath, self))) {
      return result;
    }
  }
  throw new Error(
    `Failed to load module at ${filePath} (basepath: ${self.params.path})`,
  );
};

const CREATE_BASE_REQUIRE_FN = (self: ClientLoader) => {
  const baseRequire = createRequire(self.__filename);
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
      if (id.startsWith("./") || id.startsWith("../")) {
        const resolved = path.resolve(self.__dirname, id);
        const child = self.fork(path.dirname(resolved));
        return child.import(resolved);
      }
      return baseRequire(id);
    },
  });
};

const BacktestKitCli = new Proxy(
  {},
  {
    get(_target, prop) {
      throw new Error(
        `@backtest-kit/cli is not available in this context (accessed: ${String(prop)})`,
      );
    },
  },
);

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

export class ClientLoader implements ILoader {
  __filename: string;
  __dirname: string;

  public getBaseRequire = singleshot(() => {
    this.params.logger.log("ClientLoader getBaseRequire", {
      basePath: this.params.path,
    });
    return CREATE_BASE_REQUIRE_FN(this);
  });

  constructor(readonly params: ILoaderParams) {
    this.__filename = path.join(params.path, "index.cjs");
    this.__dirname = path.dirname(this.__filename);
  }

  public fork(basePath: string) {
    this.params.logger.log("ClientLoader fork", {
      basePath: this.params.path,
      path: basePath,
    });
    return new ClientLoader({
      path: basePath,
      babel: this.params.babel,
      logger: this.params.logger,
    });
  }

  public import(filePath: string) {
    this.params.logger.log("ClientLoader import", {
      filePath,
      basePath: this.params.path,
    });
    return ENTRY_FACTORY(filePath, this);
  }
}

globalThis.BacktestKit = BacktestKit;
globalThis.BacktestKitCli = BacktestKitCli;
globalThis.BacktestKitUi = BacktestKitUi;
globalThis.BacktestKitGraph = BacktestKitGraph;
globalThis.BacktestKitOllama = BacktestKitOllama;
globalThis.BacktestKitPinets = BacktestKitPinets;
globalThis.BacktestKitSignals = BacktestKitSignals;

export default ClientLoader;
