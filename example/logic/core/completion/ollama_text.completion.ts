import {
  addCompletion,
  ISwarmCompletionArgs,
  ISwarmMessage,
} from "agent-swarm-kit";
import { CompletionName } from "../../enum/CompletionName";
import { Message } from "ollama";
import { randomString } from "functools-kit";
import { getOllama } from "../../config/ollama";

const MODEL_NAME = "gpt-oss:120b";

addCompletion({
  completionName: CompletionName.OllamaTextCompletion,
  getCompletion: async (
    params: ISwarmCompletionArgs,
  ): Promise<ISwarmMessage> => {
    const { agentName, messages: rawMessages, mode, tools } = params;

    const messages = [...rawMessages];

    const ollama = getOllama();

    const response = await ollama.chat({
      model: MODEL_NAME,
      messages: messages.map((message) => ({
        content: message.content,
        role: message.role,
        tool_calls: message.tool_calls?.map((call) => ({
          function: call.function,
        })),
      })),
      tools,
    });

    const message: Message = response.message;

    const result: ISwarmMessage = {
      ...message,
      images: undefined,
      tool_calls: response.message.tool_calls?.map((call) => ({
        function: call.function,
        type: "function" as const,
        id: randomString(),
      })),
      mode,
      agentName,
      role: response.message.role as ISwarmMessage["role"],
    };

    response.message.thinking && Reflect.set(result, "_thinking", response.message.thinking);

    return result;
  },
  flags: ["Всегда пиши ответ на русском языке", "Reasoning: high"],
});
