import { singleshot } from "functools-kit";
import { Ollama } from "ollama";
import engine from "src/lib";
import { getOllamaRotate } from "./ollama.rotate";

export const getOllama = singleshot(() => {
  const apiKey = engine.contextService.context.apiKey;
  if (Array.isArray(apiKey)) {
    return getOllamaRotate();
  }
  if (!apiKey) {
    return new Ollama();
  }
  return new Ollama({
    host: "https://ollama.com",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
});
