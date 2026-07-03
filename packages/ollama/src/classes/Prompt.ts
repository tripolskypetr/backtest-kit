import { PromptModel } from "../model/Prompt.model";

// Symbol.for keeps the brand check working when CJS and ESM copies of the
// package end up in the same process (dual-package hazard).
const PROMPT_TYPE_SYMBOL = Symbol.for("backtest-kit.ollama.prompt-type");

export class Prompt {
  private readonly __type__ = PROMPT_TYPE_SYMBOL;

  private constructor(readonly source: PromptModel) {}

  public static fromPrompt = (source: PromptModel) => {
    if (!source || typeof source !== "object") {
      throw new Error("Source must be a valid PromptModel object");
    }
    return new Prompt(source);
  };

  public static isPrompt = (value: unknown): value is Prompt => {
    return (
      value !== null &&
      typeof value === "object" &&
      (value as Prompt).__type__ === PROMPT_TYPE_SYMBOL
    );
  };
}
