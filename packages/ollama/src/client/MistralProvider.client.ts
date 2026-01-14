import {
  ISwarmMessage,
  IOutlineMessage,
  event,
  validateToolArguments,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";

import IProvider from "../interface/Provider.interface";
import { getMistral } from "../config/mistral";
import { GLOBAL_CONFIG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import OpenAI from "openai";
import { get, set } from "lodash-es";
import { singleshot } from "functools-kit";
import { ILogger } from "../interface/Logger.interface";

/**
 * Maximum number of retry attempts for outline completion.
 */
const MAX_ATTEMPTS = 3;

/**
 * Provider for Mistral AI models via OpenAI-compatible API.
 *
 * Implements Mistral API access through OpenAI-compatible endpoint.
 * Supports tool calling, simulated streaming, and structured output.
 *
 * Key features:
 * - Mistral AI API via OpenAI-compatible endpoint
 * - Tool calling with conditional inclusion
 * - Simulated streaming (complete response)
 * - Schema enforcement via tool calling with retry
 * - Debug logging support
 *
 * @example
 * ```typescript
 * const provider = new MistralProvider(contextService, logger);
 * const response = await provider.getCompletion({
 *   agentName: "mistral-assistant",
 *   messages: [{ role: "user", content: "Summarize quantum physics" }],
 *   mode: "direct",
 *   tools: [],
 *   clientId: "client-555"
 * });
 * ```
 */
export class MistralProvider implements IProvider {
  /**
   * Creates a new MistralProvider instance.
   *
   * @param contextService - Context service with model configuration
   * @param logger - Logger for operation tracking
   */
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

  /**
   * Performs standard completion request to Mistral.
   *
   * @param params - Completion parameters
   * @returns Promise resolving to assistant's response
   */
  public async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
    const mistral = getMistral();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("mistralProvider getCompletion", {
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
    } = await mistral.chat.completions.create({
      model: this.contextService.context.model,
      messages: messages as any,
      tools: formattedTools?.length ? formattedTools : undefined,
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
        "./debug_mistral_provider.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Performs simulated streaming completion.
   *
   * @param params - Completion parameters
   * @returns Promise resolving to complete response
   */
  public async getStreamCompletion(
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> {
    const mistral = getMistral();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("mistralProvider getStreamCompletion", {
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
    } = await mistral.chat.completions.create({
      model: this.contextService.context.model,
      messages: messages as any,
      tools: formattedTools?.length ? formattedTools : undefined,
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
        "./debug_mistral_provider_stream.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Performs structured output completion with schema validation.
   *
   * @param params - Outline completion parameters
   * @returns Promise resolving to validated JSON string
   * @throws Error if model fails after MAX_ATTEMPTS
   */
  public async getOutlineCompletion(
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> {
    const { messages: rawMessages, format } = params;
    const mistral = getMistral();

    this.logger.log("mistralProvider getOutlineCompletion", {
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
      } = await mistral.chat.completions.create(requestOptions);

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
              "./debug_mistral_provider_outline.txt",
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

export default MistralProvider;
