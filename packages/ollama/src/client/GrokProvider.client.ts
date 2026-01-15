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
import { GLOBAL_CONFIG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import { ILogger } from "../interface/Logger.interface";

/**
 * Custom ChatXAI implementation with simplified token counting.
 * Estimates tokens as content.length / 4 for compatibility.
 */
class CustomChat extends ChatXAI {
  async getNumTokens(content: string) {
    if (typeof content !== "string") {
      return 0;
    }
    return Math.ceil(content.length / 4);
  }
}

/**
 * Creates configured ChatXAI instance for Grok streaming.
 */
const getChat = (model: string, apiKey: string) =>
  new CustomChat({
    apiKey,
    model,
    streaming: true,
  });

/**
 * Provider for xAI Grok models via LangChain ChatXAI.
 *
 * Uses LangChain's ChatXAI integration for xAI Grok models.
 * Provides true token-by-token streaming via LangChain callbacks and OpenAI SDK for standard requests.
 *
 * Key features:
 * - LangChain ChatXAI for true streaming
 * - OpenAI SDK via getGrok() for standard completion
 * - Direct xAI API access for outline completion
 * - Tool calling via bindTools (streaming) or tools parameter (standard)
 * - Real-time token emission via stream callbacks
 * - No token rotation support (single API key only)
 *
 * @example
 * ```typescript
 * const provider = new GrokProvider(contextService, logger);
 * const response = await provider.getStreamCompletion({
 *   agentName: "grok",
 *   messages: [{ role: "user", content: "Latest AI news?" }],
 *   mode: "direct",
 *   tools: [searchTool],
 *   clientId: "client-888"
 * });
 * ```
 */
export class GrokProvider implements IProvider {
  /**
   * Creates a new GrokProvider instance.
   */
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {
  }

  /**
   * Performs standard completion request via OpenAI SDK.
   *
   * @param params - Completion parameters
   * @returns Promise resolving to assistant's response
   */
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
    if (GLOBAL_CONFIG.CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_grok_provider.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Performs true streaming completion via LangChain ChatXAI.
   * Emits tokens in real-time as they are generated.
   *
   * @param params - Completion parameters
   * @returns Promise resolving to complete response after streaming
   * @throws Error if token rotation attempted
   */
  public async getStreamCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {

    if (Array.isArray(this.contextService.context.apiKey)) {
      throw new Error("Grok provider does not support token rotation");
    }

    const chat = getChat(this.contextService.context.model, this.contextService.context.apiKey);

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
    if (GLOBAL_CONFIG.CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_grok_provider_stream.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Performs structured output completion via direct xAI API.
   * Uses response_format parameter for schema enforcement.
   *
   * @param params - Outline completion parameters
   * @returns Promise resolving to validated JSON string
   * @throws Error if model returns refusal or token rotation attempted
   */
  public async getOutlineCompletion(
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> {
    const { messages: rawMessages, format } = params;

    this.logger.log("grokProvider getOutlineCompletion", {
      context: this.contextService.context,
    });

    if (Array.isArray(this.contextService.context.apiKey)) {
      throw new Error("Grok provider does not support token rotation");
    }

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
        Authorization: `Bearer ${this.contextService.context.apiKey}`,
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
    if (GLOBAL_CONFIG.CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_grok_provider_outline.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }
}

export default GrokProvider;
