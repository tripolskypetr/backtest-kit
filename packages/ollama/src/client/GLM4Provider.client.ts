import {
  ISwarmMessage,
  IOutlineMessage,
  event,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";

import IProvider from "../interface/Provider.interface";
import { getZAi } from "../config/zai";
import { GLOBAL_CONFIG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import OpenAI from "openai";
import { ILogger } from "../interface/Logger.interface";

/**
 * GLM-4 provider implementation for Z.ai API integration.
 *
 * Provides access to Zhipu AI's GLM-4 models through OpenAI-compatible API.
 * Supports standard completions, streaming, and structured (outline) outputs.
 * Uses the Z.ai API endpoint for model inference.
 *
 * Key features:
 * - OpenAI SDK compatibility layer
 * - Tool calling support (function calls)
 * - Streaming completion with event emission
 * - Structured JSON output with schema validation
 * - Debug logging to file when enabled
 * - Message format transformation between agent-swarm-kit and OpenAI formats
 *
 * @example
 * ```typescript
 * import { GLM4Provider } from "./client/GLM4Provider.client";
 * import { ContextService } from "./services/base/ContextService";
 *
 * const provider = new GLM4Provider(contextService, logger);
 *
 * // Standard completion
 * const result = await provider.getCompletion({
 *   messages: [{ role: "user", content: "Hello" }],
 *   agentName: "test-agent",
 *   clientId: "client-123",
 *   mode: "default"
 * });
 *
 * // Streaming completion
 * const stream = await provider.getStreamCompletion({
 *   messages: [{ role: "user", content: "Analyze market" }],
 *   agentName: "trader-agent",
 *   clientId: "client-456",
 *   mode: "stream"
 * });
 *
 * // Structured output
 * const outline = await provider.getOutlineCompletion({
 *   messages: [{ role: "user", content: "Trading decision" }],
 *   format: { type: "object", properties: {...} }
 * });
 * ```
 */
export class GLM4Provider implements IProvider {
  /**
   * Creates a new GLM4Provider instance.
   *
   * @param contextService - Context service providing execution context (model, API key)
   * @param logger - Logger service for operation tracking
   */
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

  /**
   * Executes a standard GLM-4 completion request.
   *
   * Sends messages to the GLM-4 model and returns the completion response.
   * Supports tool calling (function calls) and automatically transforms message formats
   * between agent-swarm-kit and OpenAI formats.
   *
   * Key operations:
   * - Maps agent-swarm-kit messages to OpenAI format
   * - Handles tool calls with JSON serialization/deserialization
   * - Logs operation details for debugging
   * - Optionally writes debug output to file
   *
   * @param params - Completion parameters including messages, tools, and context
   * @param params.messages - Array of conversation messages
   * @param params.tools - Optional array of function tools available to the model
   * @param params.agentName - Name of the requesting agent
   * @param params.clientId - Client session identifier
   * @param params.mode - Completion mode (e.g., "default", "stream")
   * @returns Promise resolving to completion message with optional tool calls
   *
   * @example
   * ```typescript
   * const result = await provider.getCompletion({
   *   messages: [
   *     { role: "system", content: "You are a trading assistant" },
   *     { role: "user", content: "Analyze BTC market" }
   *   ],
   *   tools: [
   *     {
   *       type: "function",
   *       function: {
   *         name: "get_market_data",
   *         parameters: { type: "object", properties: {...} }
   *       }
   *     }
   *   ],
   *   agentName: "trader",
   *   clientId: "session-123",
   *   mode: "default"
   * });
   *
   * console.log(result.content); // Model's text response
   * console.log(result.tool_calls); // Any function calls requested
   * ```
   */
  public async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
    const openai = getZAi();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("glm4Provider getCompletion", {
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
        "./debug_glm4_provider.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Executes a streaming GLM-4 completion request with event emission.
   *
   * Similar to getCompletion but emits "llm-completion" events during processing
   * to enable real-time updates. The full response is accumulated and returned
   * once streaming completes.
   *
   * Key operations:
   * - Maps agent-swarm-kit messages to OpenAI format
   * - Formats tools for OpenAI API
   * - Emits events to client for real-time updates
   * - Handles tool calls with JSON parsing
   * - Logs operation details for debugging
   * - Optionally writes debug output to file
   *
   * @param params - Completion parameters including messages, tools, and context
   * @param params.messages - Array of conversation messages
   * @param params.tools - Optional array of function tools available to the model
   * @param params.agentName - Name of the requesting agent
   * @param params.clientId - Client session identifier for event emission
   * @param params.mode - Completion mode (typically "stream")
   * @returns Promise resolving to accumulated completion message
   *
   * @example
   * ```typescript
   * // Listen for streaming events
   * listen("llm-completion", (event) => {
   *   console.log("Received chunk:", event.content);
   * });
   *
   * const result = await provider.getStreamCompletion({
   *   messages: [
   *     { role: "user", content: "Generate trading signal for ETH" }
   *   ],
   *   tools: [...],
   *   agentName: "signal-agent",
   *   clientId: "client-789",
   *   mode: "stream"
   * });
   *
   * console.log("Final result:", result.content);
   * ```
   */
  public async getStreamCompletion(
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> {
    const openai = getZAi();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("glm4Provider getStreamCompletion", {
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
        "./debug_glm4_provider_stream.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Executes a structured outline completion with JSON schema validation.
   *
   * Generates a structured JSON response from GLM-4 that conforms to a provided schema.
   * Uses OpenAI's response_format parameter to enforce JSON structure.
   * The response is automatically repaired using jsonrepair if needed.
   *
   * Key operations:
   * - Maps agent-swarm-kit messages to OpenAI format
   * - Configures JSON schema response format
   * - Sends request to GLM-4 model
   * - Validates and repairs JSON response
   * - Handles refusal messages
   * - Logs operation details for debugging
   * - Optionally writes debug output to file
   *
   * @param params - Outline completion parameters
   * @param params.messages - Array of conversation messages
   * @param params.format - JSON schema format definition or response_format object
   * @returns Promise resolving to structured JSON message
   * @throws Error if model refuses to generate response
   *
   * @example
   * ```typescript
   * const signal = await provider.getOutlineCompletion({
   *   messages: [
   *     { role: "system", content: "Generate trading signals" },
   *     { role: "user", content: "Analyze BTC/USDT" }
   *   ],
   *   format: {
   *     type: "object",
   *     properties: {
   *       position: { type: "string", enum: ["long", "short", "wait"] },
   *       price_open: { type: "number" },
   *       price_stop_loss: { type: "number" },
   *       price_take_profit: { type: "number" }
   *     },
   *     required: ["position", "price_open", "price_stop_loss", "price_take_profit"]
   *   }
   * });
   *
   * const data = JSON.parse(signal.content);
   * console.log(`Position: ${data.position}`);
   * console.log(`Entry: ${data.price_open}`);
   * ```
   */
  public async getOutlineCompletion(
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> {
    const { messages: rawMessages, format } = params;
    const openai = getZAi();

    this.logger.log("glm4Provider getOutlineCompletion", {
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
        "./debug_glm4_provider_outline.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }
}

export default GLM4Provider;