import {
  addAdvisor,
  commitAssistantMessage,
  commitUserMessage,
  execute,
  fork,
} from "agent-swarm-kit";
import { randomString, str } from "functools-kit";
import { AdvisorName } from "../../enum/AdvisorName";
import { SwarmName } from "../../enum/SwarmName";
import dayjs from "dayjs";
import { AdvisorRequestContract } from "../../contract/AdvisorRequest.contract";

const SEARCH_PROMPT = str.newline(
  "Новости по конкретному активу за период — настроения рынка, события, sentiment.",
  "",
 "Искомые метрики (запросы для web_search):",
 " - Bitcoin news today {date} bullish",
 " - BTC crash risk {date} news",
 " - Bitcoin ETF news {date}",
 " - Bitcoin regulation news {date} SEC CFTC",
 " - BTC whale movement news {date}",
 " - Bitcoin hack exploit exchange {date}",
 " - BTC adoption institutional news {date}",
 " - Bitcoin FUD fear uncertainty doubt {date}",
 "",
 "Влияние на фундаментальный анализ:",
 "🐂 БЫЧЬЕ:",
 " - Одобрение ETF, институциональная покупка (MicroStrategy, BlackRock и др.)",
 " - Позитивное регуляторное решение или легализация в крупной стране",
 " - Крупное партнёрство или интеграция (платёжные системы, банки)",
 " - Рост активных адресов, объёмов on-chain",
 "🐻 МЕДВЕЖЬЕ:",
 " - Взлом крупной биржи или протокола",
 " - Запрет или ограничение крипты в крупной юрисдикции",
 " - Ликвидации крупных позиций, маржин-коллы",
 " - Негативные заявления регуляторов (SEC, ФРБ)",
 " - Форк/атака на сеть, технические уязвимости",
);

addAdvisor({
  advisorName: AdvisorName.AssetNewsAdvisor,
  getChat: async ({ resultId, date, query }: AdvisorRequestContract) => {
    console.log(`AssetNewsAdvisor called with query: ${query}, date: ${date}, resultId: ${resultId}`);
    return await fork(
      async (clientId, agentName) => {
        await commitUserMessage(
          str.newline(
            "Прочитай что именно мне нужно найти и скажи ОK",
            "",
            SEARCH_PROMPT,
          ),
          "user",
          clientId,
          agentName,
        );

        await commitAssistantMessage("OK", clientId, agentName);

        const request = str.newline(
          `Найди в интернете нужную мне информацию для ${query}`,
          `Дай только последние новости актуальные на ${dayjs(date).format("DD MMMM YYYY")}`,
          `Сформируй отчет влияющий на фундаментальный анализ`,
        );

        return await execute(request, clientId, agentName);
      },
      {
        clientId: `${resultId}_asset-news`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) => console.error(`Error in AssetNewsAdvisor for query ${query}, date ${date}, resultId ${resultId}:`, error),
      },
    );
  },
});
