import { PromptModel } from "../model/Prompt.model";

const CODE_TYPE_SYMBOL = Symbol("code-type");

export class Code {
  private readonly __type__ = CODE_TYPE_SYMBOL;

  private constructor(readonly source: PromptModel) {}

  public static fromCode = (source: PromptModel) => {
    if (!source || typeof source !== "object") {
      throw new Error("Source must be a valid PromptModel object");
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
