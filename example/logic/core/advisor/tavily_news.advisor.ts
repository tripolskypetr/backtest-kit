import { addAdvisor } from "agent-swarm-kit";
import { AdvisorName } from "../../enum/AdvisorName";
import dayjs from "dayjs";
import { WebSearchRequestContract } from "../../contract/WebSearchRequest.contract";
import { getTavily } from "../../config/tavily";
import { str } from "functools-kit";

addAdvisor({
  advisorName: AdvisorName.TavilyNewsAdvisor,
  getChat: async ({ from, to, query }: WebSearchRequestContract) => {
    console.log(
      `${AdvisorName.TavilyNewsAdvisor} called query=${query} from=${from} to=${to}`,
    );
    const tavily = getTavily();
    const { answer, ...search } = await tavily.search(
      str.space(
        `Price forecast of ${query}.`,
        "Can be bullish, bearish, neutral or sideways.",
      ),
      {
        includeAnswer: "basic",
        maxResults: 10,
        max_tokens: 25000,
        searchDepth: "advanced",
        startDate: dayjs(from).format("YYYY-MM-DD"),
        endDate: dayjs(to).format("YYYY-MM-DD"),
      },
    );
    const results = search.results.map(({ title, content }) => ({
      title,
      content,
    }));
    return JSON.stringify({ answer, results });
  },
});
