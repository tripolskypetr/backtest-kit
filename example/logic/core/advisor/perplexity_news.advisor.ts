import {
  addAdvisor,
} from "agent-swarm-kit";
import { str } from "functools-kit";
import { AdvisorName } from "../../enum/AdvisorName";
import dayjs from "dayjs";
import { WebSearchRequestContract } from "../../contract/WebSearchRequest.contract";
import { getPerplexity } from "../../config/perplexity";

addAdvisor({
  advisorName: AdvisorName.PerplexityNewsAdvisor,
  getChat: async ({ from, to, query }: WebSearchRequestContract) => {
    console.log(`${AdvisorName.PerplexityNewsAdvisor} called query=${query} from=${from} to=${to}`);
    const perplexity = getPerplexity();
    const search = await perplexity.search.create({
      display_server_time: true,
      last_updated_after_filter: dayjs(from).format('M/D/YYYY'),
      last_updated_before_filter: dayjs(to).format('M/D/YYYY'),
      max_results: 10,
      max_tokens: 25000,
      max_tokens_per_page: 2048,
      query: str.space(
        `Price forecast of ${query}.`,
        "Can be bullish, bearish, neutral or sideways.",
        "Without technical analysis",
      ),
      search_after_date_filter: dayjs(from).format('M/D/YYYY'),
      search_before_date_filter: dayjs(to).format('M/D/YYYY'),
    });
    const results = search.results.map(({ title, snippet: content }) => ({ title, content }));
    return JSON.stringify(results);
  },
});
