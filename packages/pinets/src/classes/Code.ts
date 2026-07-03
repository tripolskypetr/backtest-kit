// Symbol.for keeps the brand check working when CJS and ESM copies of the
// package end up in the same process (dual-package hazard).
const CODE_TYPE_SYMBOL = Symbol.for("backtest-kit.pinets.code-type");

export class Code {
  private readonly __type__ = CODE_TYPE_SYMBOL;

  private constructor(readonly source: string) {}

  public static fromString = (source: string) => {
    if (!source || typeof source !== "string" || !source.trim()) {
      throw new Error("Source must be a non-empty string");
    }
    return new Code(source);
  };

  public static isCode = (value: unknown): value is Code => {
    return (
      value !== null &&
      typeof value === "object" &&
      (value as Code).__type__ === CODE_TYPE_SYMBOL
    );
  };
}
