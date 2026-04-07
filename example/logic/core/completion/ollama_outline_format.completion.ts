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

const MAX_ATTEMPTS = 3;

const MODEL_NAME = "gpt-oss:120b";

addCompletion({
  completionName: CompletionName.OllamaOutlineFormatCompletion,
  getCompletion: async ({
    messages: rawMessages,
    format,
  }: IOutlineCompletionArgs): Promise<IOutlineMessage> => {
    const messages = [...rawMessages];

    const ollama = getOllama();

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
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
  },
  flags: ["Всегда пиши ответ на русском языке", "Reasoning: high"],
  json: true,
});
