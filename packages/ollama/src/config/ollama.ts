import { singleshot } from "functools-kit";
import { Ollama } from "ollama";

import { CC_OLLAMA_API_KEY } from "./params";

export const getOllama = singleshot(
  () =>
    new Ollama({
      host: "https://ollama.com",
      headers: {
        Authorization: `Bearer ${CC_OLLAMA_API_KEY}`,
      },
    })
);
