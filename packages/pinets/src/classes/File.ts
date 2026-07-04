import { join } from "path";

// Symbol.for keeps the brand check working when CJS and ESM copies of the
// package end up in the same process (dual-package hazard).
const FILE_TYPE_SYMBOL = Symbol.for("backtest-kit.pinets.file-type");

export class File {
  private readonly __type__ = FILE_TYPE_SYMBOL;

  private constructor(
    readonly path: string,
    readonly baseDir: string,
  ) {}

  public static fromPath = (
    path: string,
    baseDir = join(process.cwd(), "config/source"),
  ) => {
    if (!path || typeof path !== "string" || !path.trim()) {
      throw new Error("Path must be a non-empty string");
    }
    return new File(path, baseDir);
  };

  public static isFile = (value: unknown): value is File => {
    return (
      value !== null &&
      typeof value === "object" &&
      (value as File).__type__ === FILE_TYPE_SYMBOL
    );
  };
}
