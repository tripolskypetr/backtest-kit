import {
  ISwarmMessage,
  IOutlineMessage,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";

import IProvider from "../interface/Provider.interface";
import { getPerplexity } from "../config/perplexity";
import { GLOBAL_CONFIG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import OpenAI from "openai";
import { str } from "functools-kit";
import { ILogger } from "../interface/Logger.interface";

/**
 * Provider for Perplexity AI models via OpenAI-compatible API.
 *
 * Implements Perplexity API access with specialized message handling.
 * Filters and merges consecutive messages to comply with API requirements.
 * Note: getStreamCompletion returns error message as streaming is not supported.
 *
 * Key features:
 * - OpenAI-compatible API endpoint
 * - Message filtering (user/assistant/tool only)
 * - System message aggregation
 * - Consecutive message merging (prevents API errors)
 * - Tool calling support (requires description field)
 * - Outline completion via response_format
 * - Streaming not supported (returns error message)
 *
 * @example
 * ```typescript
 * const provider = new PerplexityProvider(contextService, logger);
 * const response = await provider.getCompletion({
 *   agentName: "perplexity-assistant",
 *   messages: [{ role: "user", content: "Latest AI research?" }],
 *   mode: "direct",
 *   tools: [searchTool],
 *   clientId: "client-333"
 * });
 * ```
 */
export class PerplexityProvider implements IProvider {
  /**
   * Creates a new PerplexityProvider instance.
   */
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

  /**
   * Performs standard completion with message filtering and merging.
   * Filters messages to user/assistant/tool only and merges consecutive messages.
   *
   * @param params - Completion parameters
   * @returns Promise resolving to assistant's response
   */
  public async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
    const perplexity = getPerplexity();

    const { clientId, agentName, messages: rawMessages, mode, tools } = params;

    this.logger.log("perplexityProvider getCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    // Filter and sort messages like in example.ts
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

    // Merge consecutive assistant messages
    for (let i = messages.length - 1; i > 0; i--) {
      if (
        messages[i].role === "assistant" &&
        messages[i - 1].role === "assistant"
      ) {
        messages[i - 1].content = str.newline(
          messages[i - 1].content,
          messages[i].content
        );
        // Merge tool_calls if they exist
        if (messages[i].tool_calls || messages[i - 1].tool_calls) {
          messages[i - 1].tool_calls = [
            ...(messages[i - 1].tool_calls || []),
            ...(messages[i].tool_calls || []),
          ];
        }
        messages.splice(i, 1);
      }
    }

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

    const formattedTools = tools?.map(
      ({ type, function: f }): OpenAI.Chat.ChatCompletionTool => ({
        type: type as "function",
        function: {
          name: f.name,
          description: f.description ?? "", // Perplexity API requires description
          parameters: f.parameters,
        },
      })
    );

    const result = await perplexity.chat.completions.create({
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
        "./debug_perplexity_provider.txt",
        JSON.stringify({ params, answer: finalResult }, null, 2) + "\n\n"
      );
    }

    return finalResult;
  }

  /**
   * Returns error message indicating streaming not supported.
   * Perplexity provider does not implement token-by-token streaming.
   *
   * @param params - Completion parameters
   * @returns Promise resolving to error message
   */
  public async getStreamCompletion(
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> {
    const { clientId, agentName, mode } = params;

    this.logger.log("perplexityProvider getStreamCompletion", {
      agentName,
      mode,
      clientId,
      context: this.contextService.context,
    });

    const result = {
      content:
        "Выбранная в настройках языковая модель не поддерживает tool_calling",
      mode,
      agentName,
      role: "assistant" as const,
    };

    return result;
  }

  /**
   * Performs structured output completion using response_format.
   * Filters and merges messages before sending.
   *
   * @param params - Outline completion parameters
   * @returns Promise resolving to validated JSON string
   * @throws Error if model returns refusal
   */
  public async getOutlineCompletion(
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> {
    const { messages: rawMessages, format } = params;
    const perplexity = getPerplexity();

    this.logger.log("perplexityProvider getOutlineCompletion", {
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

    // Merge consecutive assistant messages
    for (let i = messages.length - 1; i > 0; i--) {
      if (
        messages[i].role === "assistant" &&
        messages[i - 1].role === "assistant"
      ) {
        messages[i - 1].content = str.newline(
          messages[i - 1].content,
          messages[i].content
        );
        // Merge tool_calls if they exist
        if (messages[i].tool_calls || messages[i - 1].tool_calls) {
          messages[i - 1].tool_calls = [
            ...(messages[i - 1].tool_calls || []),
            ...(messages[i].tool_calls || []),
          ];
        }
        messages.splice(i, 1);
      }
    }

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

    const completion = await perplexity.chat.completions.create({
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
        "./debug_perplexity_provider_outline.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }
}

export default PerplexityProvider;
