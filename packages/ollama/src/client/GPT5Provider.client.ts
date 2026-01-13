import {
  ISwarmMessage,
  IOutlineMessage,
  event,
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";

import IProvider from "../interface/Provider.interface";
import { getOpenAi } from "../config/openai";
import { CC_ENABLE_DEBUG } from "../config/params";
import { jsonrepair } from "jsonrepair";
import fs from "fs/promises";
import { TContextService } from "../lib/services/base/ContextService";
import OpenAI from "openai";
import { ILogger } from "../interface/Logger.interface";

export class GPT5Provider implements IProvider {
  constructor(readonly contextService: TContextService, readonly logger: ILogger) {}

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
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_gpt5_provider.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

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
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_gpt5_provider_stream.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }

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
    if (CC_ENABLE_DEBUG) {
      await fs.appendFile(
        "./debug_gpt5_provider_outline.txt",
        JSON.stringify({ params, answer: result }, null, 2) + "\n\n"
      );
    }

    return result;
  }
}

export default GPT5Provider;
