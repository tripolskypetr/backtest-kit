import {
  ISwarmMessage,
  IOutlineMessage,
  event,
  validateToolArguments,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";

import IProvider from "../interface/Provider.interface";
import { getCohere } from "../config/cohere";
import { GLOBAL_CONFIG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import OpenAI from "openai";
import { get, set } from "lodash-es";
import { singleshot, str } from "functools-kit";
import { ILogger } from "../interface/Logger.interface";

/**
 * Maximum number of retry attempts for outline completion.
 */
const MAX_ATTEMPTS = 3;

/**
 * Provider for Cohere AI models via OpenAI-compatible API.
 *
 * Implements Cohere API access with specialized message handling for tool calling.
 * Unlike other providers, includes tool messages in conversation and does NOT merge
 * consecutive assistant messages (required for proper tool calling flow).
 *
 * Key features:
 * - OpenAI-compatible API endpoint
 * - Message filtering (user/assistant/tool - includes tool messages)
 * - System message aggregation
 * - NO consecutive assistant message merging (breaks tool calling)
 * - Tool calling support (requires description field)
 * - Outline completion via response_format
 * - Simulated streaming
 *
 * Important: Cohere requires strict tool_calls -> tool_responses sequence.
 * Merging assistant messages breaks this flow.
 *
 * @example
 * ```typescript
 * const provider = new CohereProvider(contextService, logger);
 * const response = await provider.getCompletion({
 *   agentName: "cohere-assistant",
 *   messages: [
 *     { role: "user", content: "Search for AI papers" },
 *     { role: "assistant", content: "", tool_calls: [searchCall] },
 *     { role: "tool", content: "Results...", tool_call_id: "123" }
 *   ],
 *   mode: "direct",
 *   tools: [searchTool],
 *   clientId: "client-222"
 * });
 * ```
 */
export class CohereProvider implements IProvider {
  /**
   * Creates a new CohereProvider instance.
   */
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

  /**
   * Performs standard completion with Cohere-specific message handling.
   * Includes tool messages and preserves assistant message sequence.
   *
   * @param params - Completion parameters
   * @returns Promise resolving to assistant's response
   */
  public async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
    const cohere = getCohere();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("cohereProvider getCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    // Filter and sort messages - INCLUDE TOOL MESSAGES for Cohere
    const messages: any[] = rawMessages
      .filter(
        ({ role }) => role === "user" || role === "assistant" || role === "tool"
      )
      .map(({ role, tool_call_id, tool_calls, content }) => ({
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
      }));

    const systemPrompt = rawMessages
      .filter(({ role }) => role === "system")
      .reduce((acm, { content }) => str.newline(acm, content), "");

    if (systemPrompt) {
      messages.unshift({
        role: "system",
        content: systemPrompt,
      });
    }

    // DO NOT merge consecutive assistant messages in Cohere - breaks tool calling flow
    // Cohere requires strict tool_calls -> tool_responses sequence

    // Only merge consecutive user messages (safe)
    for (let i = messages.length - 1; i > 0; i--) {
      if (messages[i].role === "user" && messages[i - 1].role === "user") {
        messages[i - 1].content = str.newline(
          messages[i - 1].content,
          messages[i].content
        );
        messages.splice(i, 1);
      }
    }

    const formattedTools = tools?.map(
      ({ type, function: f }): OpenAI.Chat.ChatCompletionTool => ({
        type: type as "function",
        function: {
          name: f.name,
          description: f.description ?? "", // Cohere API requires description
          parameters: f.parameters,
        },
      })
    );

    const result = await cohere.chat.completions.create({
      model: this.contextService.context.model,
      messages: messages as any,
      tools: formattedTools?.length ? formattedTools : undefined,
      tool_choice: "auto",
    });

    const {
      choices: [
        {
          message: { content, role, tool_calls },
        },
      ],
    } = result;

    const finalResult = {
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
        "./debug_cohere_provider.txt",
        JSON.stringify({ params, answer: finalResult }, null, 2) + "\n\n"
      );
    }

    return finalResult;
  }

  /**
   * Performs simulated streaming completion with Cohere-specific message handling.
   *
   * @param params - Completion parameters
   * @returns Promise resolving to complete response
   */
  public async getStreamCompletion(
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> {
    const cohere = getCohere();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("cohereProvider getStreamCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    // Filter and sort messages - INCLUDE TOOL MESSAGES for Cohere
    const messages: any[] = rawMessages
      .filter(
        ({ role }) => role === "user" || role === "assistant" || role === "tool"
      )
      .map(({ role, tool_call_id, tool_calls, content }) => ({
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
      }));

    const systemPrompt = rawMessages
      .filter(({ role }) => role === "system")
      .reduce((acm, { content }) => str.newline(acm, content), "");

    if (systemPrompt) {
      messages.unshift({
        role: "system",
        content: systemPrompt,
      });
    }

    // DO NOT merge consecutive assistant messages in Cohere - breaks tool calling flow
    // Cohere requires strict tool_calls -> tool_responses sequence

    // Merge consecutive user messages
    for (let i = messages.length - 1; i > 0; i--) {
      if (messages[i].role === "user" && messages[i - 1].role === "user") {
        messages[i - 1].content = str.newline(
          messages[i - 1].content,
          messages[i].content
        );
        messages.splice(i, 1);
      }
    }

    // Map tools to OpenAI format
    const formattedTools = tools?.map(
      ({ type, function: f }): OpenAI.Chat.ChatCompletionTool => ({
        type: type as "function",
        function: {
          name: f.name,
          description: f.description ?? "", // Cohere API requires description
          parameters: f.parameters,
        },
      })
    );

    const completion = await cohere.chat.completions.create({
      model: this.contextService.context.model,
      messages: messages as any,
      tools: formattedTools?.length ? formattedTools : undefined,
      tool_choice: "auto",
    });

    const {
      choices: [
        {
          message: { content, role, tool_calls },
        },
      ],
    } = completion;

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
        "./debug_cohere_provider_stream.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

  /**
   * Performs structured output completion using response_format.
   * Filters and merges user messages only (preserves assistant sequence).
   *
   * @param params - Outline completion parameters
   * @returns Promise resolving to validated JSON string
   * @throws Error if model returns refusal
   */
  public async getOutlineCompletion(
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> {
    const { messages: rawMessages, format } = params;
    const cohere = getCohere();

    this.logger.log("cohereProvider getOutlineCompletion", {
      context: this.contextService.context,
    });

    // Filter and sort messages like GPT5Provider
    const messages: any[] = rawMessages
      .filter(({ role }) => role === "user" || role === "assistant")
      .map(({ role, tool_call_id, tool_calls, content }) => ({
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
      }));

    const systemPrompt = rawMessages
      .filter(({ role }) => role === "system")
      .reduce((acm, { content }) => str.newline(acm, content), "");

    if (systemPrompt) {
      messages.unshift({
        role: "system",
        content: systemPrompt,
      });
    }

    // DO NOT merge consecutive assistant messages in Cohere - breaks tool calling flow
    // Cohere requires strict tool_calls -> tool_responses sequence

    // Merge consecutive user messages
    for (let i = messages.length - 1; i > 0; i--) {
      if (messages[i].role === "user" && messages[i - 1].role === "user") {
        messages[i - 1].content = str.newline(
          messages[i - 1].content,
          messages[i].content
        );
        messages.splice(i, 1);
      }
    }

    // Extract response format like GPT5Provider
    const response_format =
      "json_schema" in format
        ? format
        : { type: "json_schema", json_schema: { schema: format } };

    const completion = await cohere.chat.completions.create({
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
        "./debug_cohere_provider_outline.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }
}

export default CohereProvider;
