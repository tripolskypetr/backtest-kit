import {
  addCompletion,
  ISwarmCompletionArgs,
  ISwarmMessage,
} from "agent-swarm-kit";
import { CompletionName } from "../../enum/CompletionName";
import { Message } from "ollama";
import { randomString, retry } from "functools-kit";
import { getOllama } from "../../config/ollama";

const COMPLETION_MAX_RETRIES = 5;
const COMPLETION_RETRY_DELAY = 5_000;

const MODEL_NAME = "minimax-m2.7:cloud";

const fetchCompletion = retry(async ({ 
  agentName, 
  messages: rawMessages,
  mode,
  tools
}: ISwarmCompletionArgs): Promise<ISwarmMessage> => {
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
    think: false,
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
}, COMPLETION_MAX_RETRIES, COMPLETION_RETRY_DELAY);

addCompletion({
  completionName: CompletionName.OllamaTextCompletion,
  getCompletion: async (params: ISwarmCompletionArgs): Promise<ISwarmMessage> => {
    return <ISwarmMessage> await fetchCompletion(params);
  },
  flags: ["Всегда пиши ответ на русском языке", "Reasoning: high"],
});
