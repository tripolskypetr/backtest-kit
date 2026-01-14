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
import { GLOBAL_CONFIG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import { get, set } from "lodash-es";
import { randomString, singleshot } from "functools-kit";

import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import { Message } from "ollama";
import { ILogger } from "../interface/Logger.interface";

/**
 * Maximum number of retry attempts for outline completion when model fails to use tools correctly.
 */
const MAX_ATTEMPTS = 3;

/**
 * Ollama message type without image support.
 * Excludes the images field from the base Ollama Message type.
 */
type OllamaMessage = Omit<Message, keyof {
  images: never;
}>;

/**
 * Provider for Ollama LLM completions.
 *
 * Supports local and remote Ollama models with full tool calling capabilities.
 * Provides both standard and streaming completion modes, as well as structured
 * output through the outline completion method.
 *
 * Key features:
 * - Native Ollama protocol support
 * - Real-time streaming with token-by-token delivery
 * - Tool calling with automatic retry logic
 * - JSON schema validation for structured outputs
 * - Optional thinking mode support (via CC_ENABLE_THINKING)
 * - Debug logging when CC_ENABLE_DEBUG is enabled
 *
 * @example
 * ```typescript
 * const provider = new OllamaProvider(contextService, logger);
 *
 * // Standard completion
 * const response = await provider.getCompletion({
 *   agentName: "assistant",
 *   messages: [{ role: "user", content: "Hello!" }],
 *   mode: "direct",
 *   tools: [],
 *   clientId: "client-123"
 * });
 *
 * // Streaming completion
 * const streamResponse = await provider.getStreamCompletion({
 *   agentName: "assistant",
 *   messages: [{ role: "user", content: "Explain AI" }],
 *   mode: "direct",
 *   tools: [],
 *   clientId: "client-123"
 * });
 *
 * // Structured output with schema enforcement
 * const outlineResponse = await provider.getOutlineCompletion({
 *   messages: [{ role: "user", content: "Analyze sentiment" }],
 *   format: {
 *     type: "object",
 *     properties: {
 *       sentiment: { type: "string" },
 *       confidence: { type: "number" }
 *     }
 *   }
 * });
 * ```
 */
export class OllamaProvider implements IProvider {
  /**
   * Creates a new OllamaProvider instance.
   *
   * @param contextService - Context service managing model configuration and API settings
   * @param logger - Logger instance for tracking provider operations
   */
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

  /**
   * Performs a standard (non-streaming) completion request to Ollama.
   *
   * Sends messages and tools to the Ollama model and returns the complete response.
   * Supports tool calling with automatic ID generation for tool calls.
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
   *   agentName: "assistant",
   *   messages: [
   *     { role: "user", content: "What's the weather in Tokyo?" }
   *   ],
   *   mode: "direct",
   *   tools: [weatherTool],
   *   clientId: "client-123"
   * });
   * ```
   */
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
      think: GLOBAL_CONFIG.CC_ENABLE_THINKING,
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
    if (GLOBAL_CONFIG.CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_ollama_provider.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Performs a streaming completion request to Ollama.
   *
   * Sends messages and tools to the Ollama model and streams the response token by token.
   * Emits "llm-new-token" events for each token and "llm-completion" when finished.
   * Accumulates tool calls and content chunks from the stream.
   *
   * @param params - Completion parameters including messages, tools, and agent configuration
   * @param params.agentName - Name of the agent making the request
   * @param params.messages - Conversation history with roles and content
   * @param params.mode - Completion mode (e.g., "direct", "delegated")
   * @param params.tools - Available tools for the model to call
   * @param params.clientId - Client identifier for event emission
   * @returns Promise resolving to the complete assistant's response after streaming finishes
   *
   * @example
   * ```typescript
   * const response = await provider.getStreamCompletion({
   *   agentName: "assistant",
   *   messages: [
   *     { role: "user", content: "Explain quantum computing" }
   *   ],
   *   mode: "direct",
   *   tools: [],
   *   clientId: "client-123"
   * });
   * // Client receives "llm-new-token" events during generation
   * ```
   */
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
      think: GLOBAL_CONFIG.CC_ENABLE_THINKING,
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
    if (GLOBAL_CONFIG.CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_ollama_provider_stream.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Performs structured output completion using JSON schema enforcement via tool calling.
   *
   * Forces the model to use a specific tool ("provide_answer") to ensure response
   * conforms to the provided JSON schema. Implements retry logic with up to MAX_ATTEMPTS
   * attempts if the model fails to use the tool correctly or returns invalid JSON.
   *
   * Uses jsonrepair to fix malformed JSON and validates the output against the schema.
   * Adds context information to the returned data structure.
   *
   * @param params - Outline completion parameters
   * @param params.messages - Conversation history for context
   * @param params.format - JSON schema or response format definition
   * @returns Promise resolving to validated JSON string conforming to the schema
   * @throws Error if model fails to use tool after MAX_ATTEMPTS attempts
   *
   * @example
   * ```typescript
   * const response = await provider.getOutlineCompletion({
   *   messages: [
   *     { role: "user", content: "Analyze: 'Great product!'" }
   *   ],
   *   format: {
   *     type: "object",
   *     properties: {
   *       sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
   *       confidence: { type: "number", minimum: 0, maximum: 1 }
   *     },
   *     required: ["sentiment", "confidence"]
   *   }
   * });
   * // response.content = '{"sentiment":"positive","confidence":0.95,"_context":{...}}'
   * ```
   */
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
        think: GLOBAL_CONFIG.CC_ENABLE_THINKING,
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
          if (GLOBAL_CONFIG.CC_ENABLE_DEBUG) {
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
