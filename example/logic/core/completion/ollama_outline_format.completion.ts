import {
  addCompletion,
  IOutlineCompletionArgs,
  IOutlineMessage,
  validateToolArguments,
} from "agent-swarm-kit";
import { CompletionName } from "../../enum/CompletionName";
import { Message } from "ollama";
import { getOllama } from "../../config/ollama";
import { jsonrepair } from "jsonrepair";
import { retry } from "functools-kit";

const COMPLETION_MAX_ATTEMPTS = 3;
const COMPLETION_MAX_RETRIES = 5;
const COMPLETION_RETRY_DELAY = 5_000;

const MODEL_NAME = "minimax-m2.7:cloud";

const fetchCompletion = retry(async ({
  messages: rawMessages,
  format,
}: IOutlineCompletionArgs): Promise<IOutlineMessage> => {
  const messages = [...rawMessages];

  const ollama = getOllama();
  let attempt = 0;

  while (attempt < COMPLETION_MAX_ATTEMPTS) {
    try {
      const schema =
        "json_schema" in format
          ? (Reflect.get(format, "json_schema.schema") ?? format)
          : format;

      const response = await ollama.chat({
        model: MODEL_NAME,
        messages: messages.map((message) => ({
          content: message.content,
          role: message.role,
          tool_calls: message.tool_calls?.map((call) => ({
            function: call.function,
          })),
        })),
        format: schema,
        think: true,
      });

      const message: Message = response.message;

      const json = jsonrepair(message.content);

      const parsedArguments = JSON.parse(json);

      const validation = validateToolArguments(parsedArguments, schema);

      if (!validation.success) {
        throw new Error(`Attempt ${attempt + 1}: ${validation.error}`);
      }

      const result: IOutlineMessage = {
        role: "assistant",
        content: json,
      };

      message.thinking && Reflect.set(result, "_thinking", message.thinking);

      return result;
    } finally {
      attempt++;
    }
  }

  throw new Error("Model failed to use tool after maximum attempts");
}, COMPLETION_MAX_RETRIES, COMPLETION_RETRY_DELAY);

addCompletion({
  completionName: CompletionName.OllamaOutlineFormatCompletion,
  getCompletion: async (params: IOutlineCompletionArgs) => {
    return <IOutlineMessage> await fetchCompletion(params);
  },
  flags: ["Всегда пиши ответ на русском языке", "Reasoning: high"],
  json: true,
});
