import {
  ISwarmMessage,
  IOutlineMessage,
  event,
  validateToolArguments,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";

import IProvider from "../interface/Provider.interface";
import { InferenceClient } from "@huggingface/inference";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type MessageContentText,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { randomString } from "functools-kit";
import { CC_ENABLE_DEBUG } from "../config/params";
import { fetchApi, singleshot } from "functools-kit";
import { jsonrepair } from "jsonrepair";
import { get, set } from "lodash-es";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import { ILogger } from "../interface/Logger.interface";
import engine from "src/lib";

const MAX_ATTEMPTS = 5;

class HuggingFaceChat extends ChatOpenAI {
  async getNumTokens(content: string) {
    if (typeof content !== "string") {
      return 0;
    }
    return Math.ceil(content.length / 4);
  }
}

const getChat = (model: string, apiKey: string) =>
  new HuggingFaceChat({
    configuration: {
      baseURL: "https://router.huggingface.co/v1",
      apiKey,
    },
    model,
    streaming: true,
  });

const getInference = (apiKey: string) =>  new InferenceClient(apiKey);

export class HfProvider implements IProvider {
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

  public async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {

    if (Array.isArray(this.contextService.context.apiKey)) {
      throw new Error("Hf provider does not support token rotation");
    }

    const inference = getInference(this.contextService.context.apiKey);

    const { agentName, clientId, messages: rawMessages, mode, tools: rawTools } = params;

    this.logger.log("hfProvider getCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    const messages = rawMessages.map(
      ({ role, content, tool_calls, tool_call_id }) => {
        if (role === "tool") {
          return {
            role: "tool" as const,
            content,
            tool_call_id: tool_call_id!,
          };
        }
        if (role === "assistant" && tool_calls) {
          return {
            role: "assistant" as const,
            content,
            tool_calls: tool_calls.map((tc) => ({
              id: tc.id,
              type: tc.type,
              function: {
                name: tc.function.name,
                arguments:
                  typeof tc.function.arguments === "string"
                    ? tc.function.arguments
                    : JSON.stringify(tc.function.arguments),
              },
            })),
          };
        }
        return {
          role: role as "user" | "assistant" | "system",
          content,
        };
      }
    );

    const tools = rawTools?.map(({ function: f }) => ({
      type: "function" as const,
      function: {
        name: f.name,
        description: f.description,
        parameters: f.parameters,
      },
    }));

    const completion = await inference.chatCompletion({
      model: this.contextService.context.model,
      messages,
      ...(tools && { tools }),
    });

    const choice = completion.choices[0];
    const text = choice.message.content || "";
    const tool_calls = choice.message.tool_calls || [];

    const result = {
      content: text,
      mode,
      agentName: agentName!,
      role: "assistant" as const,
      tool_calls: tool_calls.map(({ id, type, function: f }) => ({
        id: id!,
        type: type as "function",
        function: {
          name: f.name,
          arguments:
            typeof f.arguments === "string"
              ? JSON.parse(f.arguments)
              : f.arguments,
        },
      })),
    };

    // Debug logging
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_hf_provider.txt",
        JSON.stringify(
          {
            params,
            answer: result,
          },
          null,
          2
        ) + "\n\n"
      );
    }

    return result;
  }

  public async getStreamCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {

    if (Array.isArray(this.contextService.context.apiKey)) {
      throw new Error("Hf provider does not support token rotation");
    }

    const chat = getChat(this.contextService.context.model, this.contextService.context.apiKey);

    const {
      agentName,
      messages: rawMessages,
      mode,
      tools: rawTools,
      clientId,
    } = params;

    this.logger.log("hfProvider getStreamCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    const tools = rawTools?.map(({ type, function: f }) => ({
      type: type as "function",
      function: {
        name: f.name,
        parameters: f.parameters,
      },
    }));

    const chatInstance = tools ? chat.bindTools(tools) : chat;

    const { content, tool_calls } = await chatInstance.invoke(
      rawMessages.map(({ role, tool_calls, tool_call_id, content }) => {
        if (role === "assistant") {
          return new AIMessage({
            tool_calls: tool_calls?.map(({ function: f, id }) => ({
              id: id!,
              name: f.name,
              args: f.arguments,
            })),
            content,
          });
        }
        if (role === "system") {
          return new SystemMessage({
            content,
          });
        }
        if (role === "user") {
          return new HumanMessage({
            content,
          });
        }
        if (role === "developer") {
          return new SystemMessage({
            content,
          });
        }
        if (role === "tool") {
          return new ToolMessage({
            tool_call_id: tool_call_id!,
            content,
          });
        }
        return "";
      }),
      {
        callbacks: [
          {
            handleLLMNewToken(token: string) {
              event(clientId, "llm-new-token", token);
            },
          },
        ],
      }
    );

    const text =
      typeof content === "string"
        ? content
        : content
            .filter((part) => part.type === "text")
            .map((c) => (c as MessageContentText).text)
            .join("");

    await event(clientId, "llm-completion", {
      content: text.trim(),
      agentName,
    });

    const result = {
      content: text,
      mode,
      agentName,
      role: "assistant" as const,
      tool_calls: tool_calls?.map(({ name, id, args }) => ({
        id: id ?? randomString(),
        type: "function" as const,
        function: {
          name,
          arguments: args,
        },
      })),
    };

    // Debug logging
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_hf_provider_stream.txt",
        JSON.stringify(
          {
            params,
            answer: result,
          },
          null,
          2
        ) + "\n\n"
      );
    }

    return result;
  }

  public async getOutlineCompletion(
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> {
    const { messages: rawMessages, format } = params;

    this.logger.log("hfProvider getOutlineCompletion", {
      context: this.contextService.context,
    });

    if (Array.isArray(this.contextService.context.apiKey)) {
      throw new Error("Hf provider does not support token rotation");
    }

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
      ...rawMessages.map(({ role, tool_call_id, tool_calls, content }) => ({
        role,
        tool_call_id,
        content,
        tool_calls: tool_calls?.map(({ function: f, ...rest }) => ({
          ...rest,
          function: {
            name: f.name,
            arguments: JSON.stringify(f.arguments),
          },
        })),
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
      const {
        choices: [{ message }],
      } = await fetchApi("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.contextService.context.apiKey}`,
        },
        body: JSON.stringify({
          messages,
          model: this.contextService.context.model,
          tools: [toolDefinition],
          tool_choice: {
            type: "function",
            function: { name: "provide_answer" },
          },
        }),
      });

      const { refusal, tool_calls, reasoning_content } = message;

      if (refusal) {
        console.error(`Attempt ${attempt + 1}: Model send refusal`);
        attempt++;
        continue;
      }

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
            const json = jsonrepair(toolCall.function.arguments);
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

          set(validation.data, "_thinking", reasoning_content);
          set(validation.data, "_context", this.contextService.context);

          const result = {
            role: "assistant" as const,
            content: JSON.stringify(validation.data),
          };

          // Debug logging
          if (CC_ENABLE_DEBUG) {
            await fs.appendFile(
              "./debug_hf_provider_outline.txt",
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

export default HfProvider;
