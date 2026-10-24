import { readFile } from "fs/promises";
import { memoize, singleshot } from "functools-kit";
import { createRequire } from "module";
import backtest from "../lib";

const METHOD_NAME_RENDER_TEMPLATE = "function.render.renderMustache";

const require = createRequire(import.meta.url);

const REQUIRE_MUSTACHE_FACTORY = async () => {
  try {
    return require("mustache");
  } catch {
    return null;
  }
};

const ESM_MUSTACHE_FACTORY = async () => {
    try {
        const module = await import("mustache");
        return module.default ?? module;
    } catch {
        return null;
    }
};

const getMustache = singleshot(async () => {
    let mustache = null;
    if (mustache = await REQUIRE_MUSTACHE_FACTORY()) {
        return mustache
    }
    if (mustache = await ESM_MUSTACHE_FACTORY()) {
        return mustache;
    }
    getMustache.clear();
    throw new Error("Mustache module not found. Please install it using 'npm install mustache' or 'yarn add mustache'.");
});

const getTemplate = memoize(
  ([path]) => `${path}`,
  async (path: string) => {
    try {
      return await readFile(path, "utf-8");
    } catch (error) {
      getTemplate.clear();
      throw error;
    }
  },
);

export async function renderMustache(path: string, view: any = {}) {
  backtest.loggerService.log(METHOD_NAME_RENDER_TEMPLATE, {
    path,
    view,
  });
  const mustache = await getMustache();
  const template = await getTemplate(path);
  return mustache.render(template, view);
};
