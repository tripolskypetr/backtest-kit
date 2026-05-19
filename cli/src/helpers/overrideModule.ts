import Module from 'module';

type ModuleInstance = Module & {
  loaded: boolean;
  filename: string;
  paths: string[];
  exports: unknown;
};

interface ModuleConstructor {
  _cache: Record<string, ModuleInstance>;
  _resolveFilename: (
    request: string,
    parent: ModuleInstance | null,
    isMain: boolean,
    options?: unknown,
  ) => string;
  new(id: string): ModuleInstance;
}

const ModuleWithCache = Module as unknown as ModuleConstructor;

const VIRTUAL_MAP = new Map<string, string>();

{
  const originalResolveFilename = ModuleWithCache._resolveFilename;
  ModuleWithCache._resolveFilename = function (request, parent, isMain, options) {
    const virtualKey = VIRTUAL_MAP.get(request);
    if (virtualKey) {
      return virtualKey;
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

function overrideModule(moduleName: string, newExports: unknown) {
  const cache = ModuleWithCache._cache;
  const key = moduleName;

  VIRTUAL_MAP.set(moduleName, key);

  if (!cache[key]) {
    cache[key] = new ModuleWithCache(key);
    cache[key].loaded = true;
    cache[key].filename = key;
    cache[key].paths = [];
  }

  cache[key].exports = newExports;
}

export { overrideModule };
