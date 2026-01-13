import {
  ISwarmMessage,
  IOutlineMessage,
  event,
  validateToolArguments,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";

import IProvider from "../interface/Provider.interface";
import { getPerplexity } from "../config/perplexity";
import { CC_ENABLE_DEBUG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import OpenAI from "openai";
import { get, set } from "lodash-es";
import { singleshot, str } from "functools-kit";
import { ILogger } from "../interface/Logger.interface";

const MAX_ATTEMPTS = 3;

export class PerplexityProvider implements IProvider {
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

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
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_perplexity_provider.txt",
        JSON.stringify({ params, answer: finalResult }, null, 2) + "\n\n"
      );
    }

    return finalResult;
  }

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
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_perplexity_provider_outline.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }
}

export default PerplexityProvider;
