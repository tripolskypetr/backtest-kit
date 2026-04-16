import { addAdvisor } from "agent-swarm-kit";
import { AdvisorName } from "../../enum/AdvisorName";
import { WebSearchRequestContract } from "../../contract/WebSearchRequest.contract";
import { fetchNews, INews } from "../../api/fetchNews";

/**
 * Market sentiment
 */
const TOPIC_QUERIES = {
  forecast: [
    "Bitcoin price forecast"
  ]
};

addAdvisor({
  advisorName: AdvisorName.TavilyNewsAdvisor,
  getChat: async ({ symbol }: WebSearchRequestContract) => {
    console.log(`${AdvisorName.TavilyNewsAdvisor} called symbol=${symbol}`);

    const newsMap = new Map<string, INews>();

    for (const [topic, queries] of Object.entries(TOPIC_QUERIES)) {
      for (const query of queries) {
        const newsList = await fetchNews(symbol, topic, query);
        console.log(`${AdvisorName.TavilyNewsAdvisor} fetchNews symbol=${symbol} topic=${topic} len=${newsList.length}`);
        newsList.forEach((item) => newsMap.set(item.url, item));
      }
    }

    const results = Array.from(newsMap.values()).map(
      ({ title, content, publishedDate }) => ({
        title,
        content,
        publishedDate,
      }),
    );

    return JSON.stringify(results);
  },
});
