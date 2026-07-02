import path from "path";
import { createRequire } from "module";
import { getErrorMessage, memoize, singleshot } from "functools-kit";
import fs from "fs";

import { ILoader, ILoaderParams } from "../interfaces/Loader.interface";

import { kill } from "../utils/notifyKill";

import * as BacktestKit from "backtest-kit";
import * as BacktestKitUi from "@backtest-kit/ui";
import * as BacktestKitGraph from "@backtest-kit/graph";
import * as BacktestKitOllama from "@backtest-kit/ollama";
import * as BacktestKitPinets from "@backtest-kit/pinets";
import * as BacktestKitSignals from "@backtest-kit/signals";

import { overrideModule } from "../helpers/overrideModule";

import { IMPORT_ALIAS } from "../config/alias";

declare const __IS_ESM__: boolean;

type Require = ReturnType<typeof CREATE_BASE_REQUIRE_FN>;

const USE_ESMODULE_DEFAULT = false;

const IMPORT_PATHS_EXCLUDE = new Set(["dump", "logs", "modules", "config", "node_modules"]);

const TRANSPILE_FN = memoize(
  ([path]) => `${path}`, 
  (path: string, code: string, self: ClientLoader, require: Require) => {
    const __filename = self.__filename;
    const __dirname = self.__dirname;
    const module = { exports: {} as Record<string, unknown> };
    const exports = module.exports;
    try {
      eval(self.params.babel.transpile(code));
    } catch (error) {
      console.log(
        `Error during transpilation error=\`${getErrorMessage(error)}\` path=\`${path}\` __filename=\`${__filename}\` __dirname=\`${__dirname}\``,
      );
      kill(-1);
      return;
    }
    return {
      require,
      __filename,
      __dirname,
      exports,
      module,
    };
  }
);

/**
 * Wrapper distinguishing "module loaded" from "loader failed": a module whose
 * exports are falsy (module.exports = null / "" / false) is still a successful
 * load. Checking the raw exports for truthiness executed such modules TWICE
 * (native require, then Babel/eval) and rejected them anyway.
 */
type EntryResult = { exports: any } | null;

const REQUIRE_ENTRY_FACTORY = (
  filePath: string,
  self: ClientLoader,
  seen: Set<string>,
  errors: unknown[],
): EntryResult => {
  if (__IS_ESM__) {
    return null;
  }
  const baseRequire = CREATE_BASE_REQUIRE_FN(self, seen);
  try {
    return { exports: baseRequire(filePath) };
  } catch (error) {
    // Expected for TS/TSX sources (native require can't parse them) — the Babel
    // path below handles those. Keep the error so a total failure reports why.
    errors.push(error);
    return null;
  }
};

const BABEL_ENTRY_FACTORY = (
  filePath: string,
  self: ClientLoader,
  seen: Set<string>,
  errors: unknown[],
): EntryResult => {
  try {
    const resolvedPath = path.resolve(self.__dirname, filePath);
    const code = fs.readFileSync(resolvedPath, "utf-8");
    const child = self.fork(path.dirname(resolvedPath));
    const transpiled = TRANSPILE_FN(resolvedPath, code, child, CREATE_BASE_REQUIRE_FN(child, seen));
    if (!transpiled) {
      // TRANSPILE_FN already reported the error and scheduled kill(-1)
      return null;
    }
    const { module } = transpiled;
    if (!USE_ESMODULE_DEFAULT) {
      return { exports: module.exports };
    }
    return {
      exports: "default" in module.exports
        ? module.exports.default
        : module.exports,
    };
  } catch (error) {
    // Never swallow the cause: a nested "Circular dependency detected" (or any
    // real load error) must surface instead of a generic "Failed to load module".
    errors.push(error);
    return null;
  }
};

const GET_EXT_VARIANTS_FN = (fileName: string): string[] => {
  const ext = path.extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  const result: string[] = [];

  {
    result.push(path.join(fileName, `index.cjs`))
    result.push(path.join(fileName, `index.mjs`))
    result.push(path.join(fileName, `index.ts`))
    result.push(path.join(fileName, `index.tsx`))
    result.push(path.join(fileName, `index.js`))
    result.push(path.join(fileName, `index.json`))
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

  {
    result.push(`${base}`)
    result.push(`${base}.cjs`)
    result.push(`${base}.mjs`)
    result.push(`${base}.ts`)
    result.push(`${base}.tsx`)
    result.push(`${base}.js`)
    result.push(`${base}.json`)
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

const ENTRY_FACTORY = (filePath: string, self: ClientLoader, seen: Set<string>) => {
  const errors: unknown[] = [];
  {
    let result: EntryResult = null;
    if ((result = REQUIRE_ENTRY_FACTORY(filePath, self, seen, errors))) {
      return result.exports;
    }
    if ((result = BABEL_ENTRY_FACTORY(filePath, self, seen, errors))) {
      return result.exports;
    }
  }
  const causes = errors.map(getErrorMessage).filter(Boolean).join("; ");
  throw new Error(
    `Failed to load module at ${filePath} (basepath: ${self.params.path})${causes ? ` caused by: ${causes}` : ""}`,
  );
};

const READ_IMPORT_PATHS_MAP_FN = singleshot((importPathsDir: string) => {
  const entries = fs.readdirSync(importPathsDir, { withFileTypes: true });
  const map: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    if (IMPORT_PATHS_EXCLUDE.has(entry.name)) {
      continue
    }
    map[entry.name] = path.join(importPathsDir, entry.name);
  }
  return map;
});

const CREATE_BASE_REQUIRE_FN = (self: ClientLoader, seen: Set<string>) => {
  const baseRequire = self.baseRequire();
  return new Proxy(baseRequire, {
    apply(_target, _this, args) {
      const id = args[0];
      if (IMPORT_ALIAS[id]) return IMPORT_ALIAS[id];
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
        return child.import(resolved, seen);
      }
      const importPathsMap = READ_IMPORT_PATHS_MAP_FN(self.params.resolve.PROJECT_ROOT_DIR);
      if (id in importPathsMap) {
        const resolved = importPathsMap[id];
        const child = self.fork(resolved);
        return child.import(resolved, seen);
      }
      const importPathsKey = Object.keys(importPathsMap).find((key) => id === key || id.startsWith(`${key}/`));
      if (importPathsKey) {
        const subPath = id.slice(importPathsKey.length);
        const resolved = path.join(importPathsMap[importPathsKey], subPath);
        const child = self.fork(path.dirname(resolved));
        return child.import(resolved, seen);
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

  public baseRequire = singleshot(() => {
    this.params.logger.log("ClientLoader baseRequire", {
      basePath: this.params.path,
    });
    return createRequire(this.__filename);
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
      resolve: this.params.resolve,
    });
  }

  public import(filePath: string, seen = new Set<string>()) {
    this.params.logger.log("ClientLoader import", {
      filePath,
      basePath: this.params.path,
    });
    const resolved = GET_RESOLVED_EXT_FN(filePath);
    if (seen.has(resolved)) {
      throw new Error(
        `Circular dependency detected: ${resolved} (seen: ${[...seen].join("->")}->${resolved})`,
      );
    }
    const currentSeen = new Set(seen);
    if (!seen.size) {
      currentSeen.add(path.resolve(this.__dirname, filePath));
    }
    currentSeen.add(resolved);
    return ENTRY_FACTORY(resolved, this, currentSeen);
  }

  public check(filePath: string) {
    this.params.logger.log("ClientLoader check", {
      filePath,
      basePath: this.params.path,
    });
    const resolved = path.resolve(this.__dirname, filePath);
    for (const variantPath of  GET_EXT_VARIANTS_FN(resolved)) {
      if (fs.existsSync(variantPath)) {
        return true;
      }
    }
    return false;
  }
}

globalThis.BacktestKit = BacktestKit;
globalThis.BacktestKitCli = BacktestKitCli;
globalThis.BacktestKitUi = BacktestKitUi;
globalThis.BacktestKitGraph = BacktestKitGraph;
globalThis.BacktestKitOllama = BacktestKitOllama;
globalThis.BacktestKitPinets = BacktestKitPinets;
globalThis.BacktestKitSignals = BacktestKitSignals;

overrideModule('backtest-kit', BacktestKit);
overrideModule('@backtest-kit/cli', BacktestKitCli);
overrideModule('@backtest-kit/ui', BacktestKitUi);
overrideModule('@backtest-kit/graph', BacktestKitGraph);
overrideModule('@backtest-kit/ollama', BacktestKitOllama);
overrideModule('@backtest-kit/pinets', BacktestKitPinets);
overrideModule('@backtest-kit/signals', BacktestKitSignals);

export default ClientLoader;
