import { singleshot } from "functools-kit";
import { ChatRequest, ChatResponse, Config, Ollama } from "ollama";

import { CC_OLLAMA_API_KEY } from "./params";
import { RoundRobin } from "agent-swarm-kit";

class OllamaWrapper {
  constructor(readonly _config: Partial<Config>) {}

  private chatFn = RoundRobin.create([CC_OLLAMA_API_KEY], (token) => {
    const ollama = new Ollama({
      ...this._config,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return async (
      request: ChatRequest
    ): Promise<ChatResponse | AsyncIterable<ChatResponse>> => {
      if (request.stream === true) {
        return await ollama.chat(request as ChatRequest & { stream: true });
      } else {
        return await ollama.chat(request as ChatRequest & { stream?: false });
      }
    };
  });

  async chat(request: ChatRequest & { stream?: false }): Promise<ChatResponse>;
  async chat(
    request: ChatRequest & { stream: true }
  ): Promise<AsyncIterable<ChatResponse>>;
  async chat(
    request: ChatRequest
  ): Promise<ChatResponse | AsyncIterable<ChatResponse>> {
    return await this.chatFn(request);
  }
}

export const getOllama = singleshot(
  () =>
    new OllamaWrapper({
      host: "https://ollama.com",
    })
);
