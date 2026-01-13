import { singleshot } from "functools-kit";
import { ChatRequest, ChatResponse, Config, Ollama } from "ollama";
import { RoundRobin } from "agent-swarm-kit";
import engine from "src/lib";

class OllamaWrapper {
  constructor(readonly _config: Partial<Config>) {
    if (!engine.contextService.context.apiKey) {
      throw new Error("OllamaRotate required apiKey[] to process token rotation");
    }
  }

  private chatFn = RoundRobin.create(<string[]>engine.contextService.context.apiKey, (token) => {
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

export const getOllamaRotate = singleshot(
  () =>
    new OllamaWrapper({
      host: "https://ollama.com",
    })
);
