import { join } from "path";

const PROMPT_TYPE_SYMBOL = Symbol("prompt-type");

export class Prompt {
  private readonly __type__ = PROMPT_TYPE_SYMBOL;

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
    return new Prompt(path, baseDir);
  };

  public static isPrompt = (value: unknown): value is Prompt => {
    return (
      value !== null &&
      typeof value === "object" &&
      (value as Prompt).__type__ === PROMPT_TYPE_SYMBOL
    );
  };
}
