import { join } from "path";

// Symbol.for keeps the brand check working when CJS and ESM copies of the
// package end up in the same process (dual-package hazard).
const MODULE_TYPE_SYMBOL = Symbol.for("backtest-kit.ollama.module-type");

export class Module {
  private readonly __type__ = MODULE_TYPE_SYMBOL;

  private constructor(
    readonly path: string,
    readonly baseDir: string,
  ) {}

  public static fromPath = (
    path: string,
    baseDir = join(process.cwd(), "config/prompt"),
  ) => {
    if (!path || typeof path !== "string" || !path.trim()) {
      throw new Error("Path must be a non-empty string");
    }
    return new Module(path, baseDir);
  };

  public static isModule = (value: unknown): value is Module => {
    return (
      value !== null &&
      typeof value === "object" &&
      (value as Module).__type__ === MODULE_TYPE_SYMBOL
    );
  };
}
