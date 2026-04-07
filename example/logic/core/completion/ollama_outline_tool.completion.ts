import {
  addCompletion,
  IOutlineCompletionArgs,
  IOutlineMessage,
  validateToolArguments,
} from "agent-swarm-kit";
import { jsonrepair } from "jsonrepair";
import { CompletionName } from "../../enum/CompletionName";
import { singleshot } from "functools-kit";
import { getOllama } from "../../config/ollama";

const MAX_ATTEMPTS = 3;

const MODEL_NAME = "gpt-oss:120b";

addCompletion({
  completionName: CompletionName.OllamaOutlineToolCompletion,
  getCompletion: async ({
    messages: rawMessages,
    format,
  }: IOutlineCompletionArgs): Promise<IOutlineMessage> => {
    const ollama = getOllama();

    const schema =
      "json_schema" in format
        ? (Reflect.get(format, "json_schema.schema") ?? format)
        : format;
    const toolDefinition = {
      type: "function",
      function: {
        name: "provide_answer",
        description: "Предоставить ответ в требуемом формате",
        parameters: schema,
      },
    };

    // Add system instruction for tool usage
    const systemMessage = {
      role: "system",
      content:
        "ОБЯЗАТЕЛЬНО используй инструмент provide_answer для предоставления ответа. НЕ отвечай обычным текстом. ВСЕГДА вызывай инструмент provide_answer с правильными параметрами.",
    };

    const messages = [systemMessage, ...rawMessages];

    let attempt = 0;

    const addToolRequestMessage = singleshot(() => {
      messages.push({
        role: "user",
        content:
          "Пожалуйста, используй инструмент provide_answer для предоставления ответа. Не отвечай обычным текстом.",
      });
    });

    while (attempt < MAX_ATTEMPTS) {
      const response = await ollama.chat({
        model: MODEL_NAME,
        messages,
        tools: [toolDefinition],
        think: true,
      });

      const { tool_calls } = response.message;

      if (!tool_calls?.length) {
        console.error(
          `Attempt ${attempt + 1}: Model did not use tool, adding user message`,
        );
        addToolRequestMessage();
        attempt++;
        continue;
      }

      if (tool_calls && tool_calls.length > 0) {
        const toolCall = tool_calls[0];
        if (toolCall.function?.name === "provide_answer") {
          let parsedArguments: any;
          try {
            const argumentsString =
              typeof toolCall.function.arguments === "string"
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments);
            const json = jsonrepair(argumentsString);
            parsedArguments = JSON.parse(json);
          } catch (error) {
            console.error(
              `Attempt ${attempt + 1}: Failed to parse tool arguments:`,
              error,
            );
            addToolRequestMessage();
            attempt++;
            continue;
          }

          const validation = validateToolArguments(parsedArguments, schema);

          if (!validation.success) {
            console.error(`Attempt ${attempt + 1}: ${validation.error}`);
            addToolRequestMessage();
            attempt++;
            continue;
          }

          const result = {
            role: "assistant" as const,
            content: JSON.stringify(validation.data),
          };

          response.message.thinking && Reflect.set(result, "_thinking", response.message.thinking);

          return result;
        }
      }

      console.error(`Attempt ${attempt + 1}: Model send refusal`);
      attempt++;
    }

    throw new Error("Model failed to use tool after maximum attempts");
  },
  json: true,
  flags: ["Всегда пиши ответ на русском языке", "Reasoning: high"],
});
