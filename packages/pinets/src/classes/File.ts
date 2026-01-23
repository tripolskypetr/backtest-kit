import { join } from "path";

const FILE_TYPE_SYMBOL = Symbol("file-type");

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
