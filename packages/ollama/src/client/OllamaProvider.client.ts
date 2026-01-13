import {
  ISwarmMessage,
  IOutlineMessage,
  event,
  validateToolArguments,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";
import IProvider from "../interface/Provider.interface";
import { getOllama } from "../config/ollama";
import { CC_ENABLE_DEBUG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import { get, set } from "lodash-es";
import { randomString, singleshot } from "functools-kit";

import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import { Message } from "ollama";
import { ILogger } from "../interface/Logger.interface";

const MAX_ATTEMPTS = 3;

type OllamaMessage = Omit<Message, keyof {
  images: never;
}>;

export class OllamaProvider implements IProvider {
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

  public async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
    const { agentName, messages: rawMessages, mode, tools, clientId } = params;

    const ollama = getOllama();

    this.logger.log("ollamaProvider getCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    const messages = [...rawMessages];

    const response = await ollama.chat({
      model: this.contextService.context.model,
      messages: messages.map((message) => ({
        content: message.content,
        role: message.role,
        tool_calls: message.tool_calls?.map((call) => ({
          function: call.function,
        })),
      })),
      tools,
    });

    const message: OllamaMessage = response.message;

    const result = {
      ...message,
      tool_calls: response.message.tool_calls?.map((call) => ({
        function: call.function,
        type: "function" as const,
        id: randomString(),
      })),
      mode,
      agentName,
      role: response.message.role as ISwarmMessage["role"],
    };

    // Debug logging
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_ollama_provider.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  public async getStreamCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
    const { agentName, messages: rawMessages, mode, tools, clientId } = params;

    const ollama = getOllama();

    this.logger.log("ollamaProvider getStreamCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    const messages = rawMessages.map((message) => ({
      content: message.content,
      role: message.role,
      tool_calls: message.tool_calls?.map((call) => ({
        function: call.function,
      })),
    }));

    let content = "";
    let toolCalls: any[] = [];

    // Stream the response
    const stream = await ollama.chat({
      model: this.contextService.context.model,
      messages,
      tools,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.message.tool_calls) {
        // Accumulate tool calls
        for (const tool of chunk.message.tool_calls) {
          toolCalls.push(tool);
        }
      } else if (chunk.message.content) {
        // Stream content tokens
        content += chunk.message.content;
        await event(clientId, "llm-new-token", chunk.message.content);
      }
    }

    // Send completion event
    await event(clientId, "llm-completion", {
      content: content.trim(),
      agentName,
    });

    const result = {
      content,
      mode,
      agentName,
      role: "assistant" as const,
      tool_calls: toolCalls.map((call) => ({
        function: call.function,
        type: "function" as const,
        id: randomString(),
      })),
    };

    // Debug logging
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_ollama_provider_stream.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  public async getOutlineCompletion(
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> {
    const { messages: rawMessages, format } = params;
    const ollama = getOllama();

    this.logger.log("ollamaProvider getOutlineCompletion", {
      context: this.contextService.context,
    });

    // Create tool definition based on format schema
    const schema =
      "json_schema" in format
        ? get(format, "json_schema.schema", format)
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

    const messages = [
      systemMessage,
      ...rawMessages.map(({ role, content }) => ({
        role,
        content,
      })),
    ];

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
        model: this.contextService.context.model,
        messages,
        tools: [toolDefinition],
      });

      const { tool_calls } = response.message;

      if (!tool_calls?.length) {
        console.error(
          `Attempt ${attempt + 1}: Model did not use tool, adding user message`
        );
        addToolRequestMessage();
        attempt++;
        continue;
      }

      if (tool_calls && tool_calls.length > 0) {
        const toolCall = tool_calls[0];
        if (toolCall.function?.name === "provide_answer") {
          // Parse JSON with repair
          let parsedArguments: any;
          try {
            const argumentsString = typeof toolCall.function.arguments === 'string'
              ? toolCall.function.arguments
              : JSON.stringify(toolCall.function.arguments);
            const json = jsonrepair(argumentsString);
            parsedArguments = JSON.parse(json);
          } catch (error) {
            console.error(
              `Attempt ${attempt + 1}: Failed to parse tool arguments:`,
              error
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

          set(validation.data, "_context", this.contextService.context);

          const result = {
            role: "assistant" as const,
            content: JSON.stringify(validation.data),
          };

          // Debug logging
          if (CC_ENABLE_DEBUG) {
            await fs.appendFile(
              "./debug_ollama_provider_outline.txt",
              JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
            );
          }

          return result;
        }
      }

      console.error(`Attempt ${attempt + 1}: Model send refusal`);
      attempt++;
    }

    throw new Error("Model failed to use tool after maximum attempts");
  }
}

export default OllamaProvider;
