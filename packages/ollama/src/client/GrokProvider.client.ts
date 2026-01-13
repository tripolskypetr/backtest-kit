import {
  ISwarmMessage,
  IOutlineMessage,
  event,
  IToolCall,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";

import IProvider from "../interface/Provider.interface";
import { getGrok } from "../config/grok";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type MessageContentText,
} from "@langchain/core/messages";
import {
  errorData,
  getErrorMessage,
  randomString,
  singleshot,
  fetchApi,
} from "functools-kit";
import { ChatXAI } from "@langchain/xai";
import { CC_ENABLE_DEBUG, CC_GROK_API_KEY } from "../config/params";
import { jsonrepair } from "jsonrepair";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import { ILogger } from "../interface/Logger.interface";

class CustomChat extends ChatXAI {
  async getNumTokens(content: string) {
    if (typeof content !== "string") {
      return 0;
    }
    return Math.ceil(content.length / 4);
  }
}

const getChat = (model: string) =>
  new CustomChat({
    apiKey: CC_GROK_API_KEY,
    model,
    streaming: true,
  });

export class GrokProvider implements IProvider {

  constructor(readonly contextService: TContextService, readonly logger: ILogger) {
  }

  public async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
    const grok = getGrok();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("grokProvider getCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    const messages = rawMessages.map(
      ({ role, tool_call_id, tool_calls, content }) => ({
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
      })
    );

    const {
      choices: [
        {
          message: { content, role, tool_calls },
        },
      ],
    } = await grok.chat.completions.create({
      model: this.contextService.context.model,
      messages: messages as any,
      tools: tools as any,
      response_format: {
        type: "text",
      },
    });

    const result = {
      content: content!,
      mode,
      agentName,
      role,
      tool_calls: tool_calls?.map(({ function: f, ...rest }) => ({
        ...rest,
        function: {
          name: f.name,
          arguments: JSON.parse(f.arguments),
        },
      })),
    };

    // Debug logging
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_grok_provider.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  public async getStreamCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
    const chat = getChat(this.contextService.context.model);

    const {
      agentName,
      messages: rawMessages,
      mode,
      tools: rawTools,
      clientId,
    } = params;

    this.logger.log("grokProvider getStreamCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    // Validate and format tools
    const tools = rawTools?.map(({ type, function: f }) => ({
      type: "function",
      function: {
        name: f.name,
        description: f.description || "",
        parameters: f.parameters || { type: "object", properties: {} },
      },
    }));

    // Bind tools to chat instance if tools are provided
    const chatInstance = tools?.length ? chat.bindTools(tools) : chat;

    // Map raw messages to LangChain messages
    const messages = rawMessages.map(
      ({ role, tool_calls, tool_call_id, content }) => {
        if (role === "assistant") {
          return new AIMessage({
            content,
            tool_calls: tool_calls?.map(({ function: f, id }) => ({
              id: id || randomString(),
              name: f.name,
              args: f.arguments,
            })),
          });
        }
        if (role === "system") {
          return new SystemMessage({ content });
        }
        if (role === "user") {
          return new HumanMessage({ content });
        }
        if (role === "developer") {
          return new SystemMessage({ content });
        }
        if (role === "tool") {
          return new ToolMessage({
            tool_call_id: tool_call_id || randomString(),
            content,
          });
        }
        throw new Error(`Unsupported message role: ${role}`);
      }
    );

    let textContent = "";
    let toolCalls: any[] = [];

    // Handle streaming response
    const stream = await chatInstance.stream(messages);

    // Aggregate tool calls and content from stream, emit chunks
    for await (const chunk of stream) {
      if (chunk.content) {
        textContent += chunk.content;
        await event(clientId, "llm-new-token", chunk.content); // Emit content chunk
      }
      if (chunk.tool_calls?.length) {
        toolCalls = [...toolCalls, ...chunk.tool_calls];
      }
    }

    // Process content if it's an array of parts
    const finalContent = Array.isArray(textContent)
      ? textContent
          .filter((part: any) => part.type === "text")
          .map((c: MessageContentText) => c.text)
          .join("")
      : textContent;

    await event(clientId, "llm-completion", {
      content: finalContent.trim(),
      agentName,
    });

    // Format tool calls for return
    const formattedToolCalls = toolCalls.map(({ name, id, args }) => ({
      id: id || randomString(),
      type: "function",
      function: {
        name,
        arguments: args,
      },
    }));

    const result = {
      content: finalContent,
      mode,
      agentName,
      role: "assistant" as const,
      tool_calls: formattedToolCalls as IToolCall[],
    };

    // Debug logging
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_grok_provider_stream.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  public async getOutlineCompletion(
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> {
    const { messages: rawMessages, format } = params;

    this.logger.log("grokProvider getOutlineCompletion", {
      context: this.contextService.context,
    });

    const messages = rawMessages.map(
      ({ role, tool_call_id, tool_calls, content }) => ({
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
      })
    );

    const {
      choices: [
        {
          message: { refusal, content },
        },
      ],
    } = await fetchApi("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CC_GROK_API_KEY}`,
      },
      body: JSON.stringify({
        messages,
        context: this.contextService.context,
        max_tokens: 5_000,
        response_format: format,
      }),
    });

    if (refusal) {
      throw new Error(refusal);
    }

    const json = jsonrepair(content);
    const result = {
      role: "assistant" as const,
      content: json,
    };

    // Debug logging
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_grok_provider_outline.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }
}

export default GrokProvider;
