import {
  addAdvisor,
  commitAssistantMessage,
  commitUserMessage,
  execute,
  fork,
} from "agent-swarm-kit";
import { str } from "functools-kit";
import { AdvisorName } from "../../enum/AdvisorName";
import { SwarmName } from "../../enum/SwarmName";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { WebSearchRequestContract } from "logic/contract/WebSearchRequest.contract";
dayjs.extend(utc);

const SEARCH_PROMPT = str.newline(
  "Новости по конкретному активу за последние 8 часов — события, sentiment, крупные движения.",
  "",
  "Искомые метрики (запросы для web_search):",
  " - Bitcoin news last 8 hours {datetime}",
  " - BTC breaking news {datetime}",
  " - Bitcoin ETF flow {datetime}",
  " - Bitcoin whale alert {datetime}",
  " - BTC exchange inflow outflow {datetime}",
  " - Bitcoin hack exploit {datetime}",
  " - BTC liquidations {datetime}",
  " - Bitcoin institutional buy sell {datetime}",
  "",
  "Влияние на построение сетки (8-часовой горизонт):",
  "🐂 БЫЧЬЕ:",
  " - Крупный институциональный buy / ETF inflow",
  " - Позитивное регуляторное заявление",
  " - Whale accumulation on-chain",
  " - Short squeeze / ликвидация шортов",
  "🐻 МЕДВЕЖЬЕ:",
  " - Взлом биржи / протокола",
  " - Крупный ETF outflow",
  " - Whale dump / exchange inflow",
  " - Cascade ликвидаций лонгов",
);

addAdvisor({
  advisorName: AdvisorName.AssetNewsAdvisor,
  getChat: async ({ resultId, date, query }: WebSearchRequestContract) => {
    console.log(`AssetNewsAdvisor called with query: ${query}, date: ${date}`);
    return await fork(
      async (clientId, agentName) => {
        await commitUserMessage(
          str.newline("Прочитай что именно мне нужно найти и скажи ОК", "", SEARCH_PROMPT),
          "user",
          clientId,
          agentName,
        );
        await commitAssistantMessage("OK", clientId, agentName);
        const request = str.newline(
          `Найди в интернете нужную мне информацию для ${query}`,
          `Дай только последние новости актуальные на ${dayjs.utc(date).format("DD MMMM YYYY HH:mm")} UTC`,
          `Ищи новости за последние 8 часов`,
          `Сформируй отчет влияющий на краткосрочное движение цены`,
        );
        return await execute(request, clientId, agentName);
      },
      {
        clientId: `${resultId}_asset-news`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) => console.error(`Error in AssetNewsAdvisor for query ${query}:`, error),
      },
    );
  },
});
