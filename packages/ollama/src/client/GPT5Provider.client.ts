import {
  ISwarmMessage,
  IOutlineMessage,
  event,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";

import IProvider from "../interface/Provider.interface";
import { getOpenAi } from "../config/openai";
import { GLOBAL_CONFIG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import OpenAI from "openai";
import { ILogger } from "../interface/Logger.interface";

/**
 * Provider for OpenAI GPT models (GPT-4, GPT-4 Turbo, GPT-3.5, etc.).
 *
 * Implements the OpenAI Chat Completions API with full tool calling support.
 * Uses the official OpenAI SDK for reliable communication with OpenAI's API.
 * Supports both standard and simulated streaming modes.
 *
 * Key features:
 * - OpenAI Chat Completions API via official SDK
 * - Tool calling with automatic argument serialization
 * - Simulated streaming (returns complete response, emits completion event)
 * - JSON schema enforcement for structured outputs
 * - Debug logging when CC_ENABLE_DEBUG is enabled
 *
 * Note: This provider does not implement true token-by-token streaming.
 * The getStreamCompletion method returns the complete response and emits
 * a single completion event to maintain interface compatibility.
 *
 * @example
 * ```typescript
 * const provider = new GPT5Provider(contextService, logger);
 *
 * // Standard completion with GPT-4
 * const response = await provider.getCompletion({
 *   agentName: "assistant",
 *   messages: [{ role: "user", content: "Explain relativity" }],
 *   mode: "direct",
 *   tools: [],
 *   clientId: "client-123"
 * });
 *
 * // Structured output with JSON schema
 * const analysis = await provider.getOutlineCompletion({
 *   messages: [{ role: "user", content: "Analyze sentiment" }],
 *   format: {
 *     type: "json_schema",
 *     json_schema: {
 *       schema: {
 *         type: "object",
 *         properties: {
 *           sentiment: { type: "string" },
 *           score: { type: "number" }
 *         }
 *       }
 *     }
 *   }
 * });
 * ```
 */
export class GPT5Provider implements IProvider {
  /**
   * Creates a new GPT5Provider instance.
   *
   * @param contextService - Context service managing model configuration and API key
   * @param logger - Logger instance for tracking provider operations
   */
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

  /**
   * Performs a standard completion request to OpenAI.
   *
   * Sends messages and tools to the OpenAI API and returns the complete response.
   * Automatically serializes tool call arguments to JSON strings for API compatibility.
   *
   * @param params - Completion parameters including messages, tools, and agent configuration
   * @param params.agentName - Name of the agent making the request
   * @param params.messages - Conversation history with roles and content
   * @param params.mode - Completion mode (e.g., "direct", "delegated")
   * @param params.tools - Available tools for the model to call
   * @param params.clientId - Client identifier for tracking requests
   * @returns Promise resolving to the assistant's response message with optional tool calls
   *
   * @example
   * ```typescript
   * const response = await provider.getCompletion({
   *   agentName: "gpt-assistant",
   *   messages: [
   *     { role: "user", content: "Calculate 15% tip on $85" }
   *   ],
   *   mode: "direct",
   *   tools: [calculatorTool],
   *   clientId: "client-456"
   * });
   * ```
   */
  public async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
    const openai = getOpenAi();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("gpt5Provider getCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    // Map raw messages to OpenAI format
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
    } = await openai.chat.completions.create({
      model: this.contextService.context.model,
      messages: messages as any,
      tools: tools as any,
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
        "./debug_gpt5_provider.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Performs a simulated streaming completion request to OpenAI.
   *
   * Note: This method does NOT implement true token-by-token streaming.
   * It performs a standard completion and emits a single "llm-completion"
   * event with the full response to maintain interface compatibility.
   *
   * For true streaming, the OpenAI SDK streaming API would need to be used
   * with "stream: true" parameter.
   *
   * @param params - Completion parameters including messages, tools, and agent configuration
   * @param params.agentName - Name of the agent making the request
   * @param params.messages - Conversation history with roles and content
   * @param params.mode - Completion mode (e.g., "direct", "delegated")
   * @param params.tools - Available tools for the model to call
   * @param params.clientId - Client identifier for event emission
   * @returns Promise resolving to the complete assistant's response
   *
   * @example
   * ```typescript
   * const response = await provider.getStreamCompletion({
   *   agentName: "gpt-assistant",
   *   messages: [
   *     { role: "user", content: "Write a haiku about coding" }
   *   ],
   *   mode: "direct",
   *   tools: [],
   *   clientId: "client-456"
   * });
   * // Client receives single "llm-completion" event with full response
   * ```
   */
  public async getStreamCompletion(
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> {
    const openai = getOpenAi();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("gpt5Provider getStreamCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    // Map raw messages to OpenAI format
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

    // Map tools to OpenAI format
    const formattedTools = tools?.map(
      ({ type, function: f }): OpenAI.Chat.ChatCompletionTool => ({
        type: type as "function",
        function: {
          name: f.name,
          parameters: f.parameters,
        },
      })
    );

    const {
      choices: [
        {
          message: { content, role, tool_calls },
        },
      ],
    } = await openai.chat.completions.create({
      model: this.contextService.context.model,
      messages: messages as any,
      tools: formattedTools as any,
    });

    // Emit events to mimic streaming behavior
    if (content) {
      await event(clientId, "llm-completion", {
        content: content.trim(),
        agentName,
      });
    }

    const result = {
      content: content || "",
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
        "./debug_gpt5_provider_stream.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Performs structured output completion using OpenAI's response_format parameter.
   *
   * Uses OpenAI's native JSON schema mode to enforce structured output.
   * The model is instructed to respond in a specific JSON format matching
   * the provided schema. Uses jsonrepair to handle any JSON formatting issues.
   *
   * @param params - Outline completion parameters
   * @param params.messages - Conversation history for context
   * @param params.format - JSON schema or response format definition (supports both formats)
   * @returns Promise resolving to validated JSON string conforming to the schema
   * @throws Error if model returns a refusal message
   *
   * @example
   * ```typescript
   * const response = await provider.getOutlineCompletion({
   *   messages: [
   *     { role: "user", content: "Extract entities from: 'Apple released iPhone in Cupertino'" }
   *   ],
   *   format: {
   *     type: "json_schema",
   *     json_schema: {
   *       schema: {
   *         type: "object",
   *         properties: {
   *           entities: {
   *             type: "array",
   *             items: {
   *               type: "object",
   *               properties: {
   *                 text: { type: "string" },
   *                 type: { type: "string" }
   *               }
   *             }
   *           }
   *         }
   *       }
   *     }
   *   }
   * });
   * ```
   */
  public async getOutlineCompletion(
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> {
    const { messages: rawMessages, format } = params;
    const openai = getOpenAi();

    this.logger.log("gpt5Provider getOutlineCompletion", {
      context: this.contextService.context,
    });

    // Map raw messages to OpenAI format
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

    // Extract response format
    const response_format =
      "json_schema" in format
        ? format
        : { type: "json_schema", json_schema: { schema: format } };

    const completion = await openai.chat.completions.create({
      messages: messages as any,
      model: this.contextService.context.model,
      response_format: response_format as any,
    });

    const choice = completion.choices[0];

    if (choice.message.refusal) {
      throw new Error(choice.message.refusal);
    }

    const json = jsonrepair(choice.message.content || "");
    const result = {
      role: "assistant" as const,
      content: json,
    };

    // Debug logging
    if (GLOBAL_CONFIG.CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_gpt5_provider_outline.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }
}

export default GPT5Provider;
