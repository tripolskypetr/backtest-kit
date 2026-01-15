import {
  ISwarmMessage,
  IOutlineMessage,
  event,
  IToolCall,
  validateToolArguments,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";

import IProvider from "../interface/Provider.interface";
import { getClaude } from "../config/claude";
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
import { get, set } from "lodash-es";
import { ChatOpenAI } from "@langchain/openai";
import { GLOBAL_CONFIG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import OpenAI from "openai";
import { ILogger } from "../interface/Logger.interface";

/**
 * Maximum number of retry attempts for outline completion when model fails to use tools correctly.
 */
const MAX_ATTEMPTS = 5;

/**
 * Provider for Anthropic Claude models via OpenAI-compatible API.
 *
 * Note: This file exports ClaudeProvider class name but implements Claude functionality.
 * This appears to be a naming inconsistency that should be addressed.
 *
 * Implements Claude API access through OpenAI-compatible endpoint with full tool calling support.
 * Supports both standard and simulated streaming modes, as well as structured output
 * through tool-based schema enforcement.
 *
 * Key features:
 * - Claude API via OpenAI-compatible endpoint
 * - Tool calling with retry logic and validation
 * - Simulated streaming (returns complete response)
 * - JSON schema enforcement via tool calling
 * - Conditional tool parameter (only adds if tools present)
 * - Debug logging when CC_ENABLE_DEBUG is enabled
 *
 * @example
 * ```typescript
 * const provider = new ClaudeProvider(contextService, logger); // Note: Should be ClaudeProvider
 *
 * // Standard completion
 * const response = await provider.getCompletion({
 *   agentName: "claude-assistant",
 *   messages: [{ role: "user", content: "Explain neural networks" }],
 *   mode: "direct",
 *   tools: [searchTool],
 *   clientId: "client-789"
 * });
 *
 * // Structured output with schema validation
 * const structured = await provider.getOutlineCompletion({
 *   messages: [{ role: "user", content: "Classify: 'Best purchase ever!'" }],
 *   format: {
 *     type: "object",
 *     properties: {
 *       category: { type: "string" },
 *       confidence: { type: "number" }
 *     }
 *   }
 * });
 * ```
 */
export class ClaudeProvider implements IProvider {
  /**
   * Creates a new ClaudeProvider instance (implements Claude functionality).
   *
   * @param contextService - Context service managing model configuration and API key
   * @param logger - Logger instance for tracking provider operations
   */
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

  /**
   * Performs a standard completion request to Claude via OpenAI-compatible API.
   * Only adds tools parameter if tools array is non-empty.
   *
   * @param params - Completion parameters
   * @returns Promise resolving to assistant's response message
   */
  public async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
    const claude = getClaude();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("claudeProvider getCompletion", {
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

    // Prepare request options
    const requestOptions: any = {
      model: this.contextService.context.model,
      messages: messages as any,
      response_format: {
        type: "text",
      },
    };

    // Only add tools if they exist and have at least one item
    if (tools && tools.length > 0) {
      requestOptions.tools = tools;
    }

    const {
      choices: [
        {
          message: { content, role, tool_calls },
        },
      ],
    } = await claude.chat.completions.create(requestOptions);

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
        "./debug_claude_provider.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Performs simulated streaming completion (returns complete response, emits completion event).
   *
   * @param params - Completion parameters
   * @returns Promise resolving to complete assistant's response
   */
  public async getStreamCompletion(
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> {
    const openai = getClaude();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("claudeProvider getStreamCompletion", {
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
   * Performs structured output completion using tool calling with retry logic.
   * Uses tool_choice to force model to use the provide_answer tool.
   *
   * @param params - Outline completion parameters
   * @returns Promise resolving to validated JSON string
   * @throws Error if model fails after MAX_ATTEMPTS attempts
   */
  public async getOutlineCompletion(
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> {
    const { messages: rawMessages, format } = params;
    const claude = getClaude();

    this.logger.log("claudeProvider getOutlineCompletion", {
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
      // Prepare request options
      const requestOptions: any = {
        model: this.contextService.context.model,
        messages: messages as any,
        tools: [toolDefinition],
        tool_choice: {
          type: "function",
          function: { name: "provide_answer" },
        },
      };

      const {
        choices: [{ message }],
      } = await claude.chat.completions.create(requestOptions);

      const { refusal, tool_calls } = message;

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

          set(validation.data, "_context", this.contextService.context);

          const result = {
            role: "assistant" as const,
            content: JSON.stringify(validation.data),
          };

          // Debug logging
          if (GLOBAL_CONFIG.CC_ENABLE_DEBUG) {
            await fs.appendFile(
              "./debug_claude_provider_outline.txt",
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

export default ClaudeProvider;
