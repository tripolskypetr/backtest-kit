import { addTool, commitToolOutput, execute, getAgent, getAgentHistory } from "agent-swarm-kit";
import { getOllama } from "../../config/ollama";
import { retry, sleep, str } from "functools-kit";
import { ToolName } from "../../enum/ToolName";
import { WebSearchRequestContract } from "../../contract/WebSearchRequest.contract";
import { errorEmitter } from "../../config/emitters";
import { ERROR_SYMBOL } from "../../config/constant";

const MAX_SEARCH_ATTEMPTS = 15;

const SEARCH_MAX_RESULTS = 10;
const SEARCH_RETRY_COUNT = 5;
const SEARCH_RETRY_DELAY = 5_000;

const SEARCH_TIMEOUT = 30_000;
const SEARCH_TIMEOUT_SYMBOL = Symbol("SEARCH_TIMEOUT");

const fetchNews = retry(async (query: string) => {
  const ollama = getOllama();
  const data = await Promise.race([
    ollama.webSearch({
      query: String(query),
      maxResults: SEARCH_MAX_RESULTS,
    }),
    sleep(SEARCH_TIMEOUT).then(() => SEARCH_TIMEOUT_SYMBOL)
  ]);
  if (typeof data === "symbol") {
    console.warn("Web search timed out, retrying...");
    throw new Error("Web search timed out");
  }
  return JSON.stringify(data.results, null, 2);
}, SEARCH_RETRY_COUNT, SEARCH_RETRY_DELAY);

addTool<WebSearchRequestContract>({
  toolName: ToolName.WebSearchTool,
  isAvailable: async (clientId, agentName) => {
    const history = await getAgentHistory(clientId, agentName);
    return history.length <= MAX_SEARCH_ATTEMPTS;  
  },
  call: async ({ toolId, params, clientId, agentName, isLast }) => {
    if (!params.query) {
      const content =
        "The `query` argument is required. Call `web_search` with a search query to get results.";
      await commitToolOutput(toolId, content, clientId, agentName);
    }
    if (params.query) {
      console.log(`Searching ${params.query}`);
      const content = <string> await fetchNews(params.query);
      await commitToolOutput(toolId, content, clientId, agentName);
    }
    if (isLast) {
      await execute("", clientId, agentName);
    }
  },
  type: "function",
  function: {
    name: "web_search",
    description: str.space(
      "Search the web for current information.",
      "Use this when you need up-to-date information that may not be",
      "in your training data.",
    ),
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up on the web",
        },
      },
      required: ["query"],
    },
  },
  callbacks: {
    async onCallError() {
      await errorEmitter.next(ERROR_SYMBOL);
    },
  }
});
