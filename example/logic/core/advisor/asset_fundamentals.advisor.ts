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
  "Комплексные фундаментальные данные компании",
  "",
  "Для Bitcoin аналог фундаментала (запросы для web_search):",
  " - Bitcoin hash rate {date} all time high",
  " - Bitcoin network difficulty adjustment {date}",
  " - Bitcoin miner revenue {date} profitability",
  " - Bitcoin NVT ratio {date} overvalued undervalued",
  " - Bitcoin stock-to-flow model {date} prediction",
  " - Bitcoin realized cap vs market cap MVRV {date}",
  "",
  "Влияние на фундаментальный анализ:",
  "🐂 БЫЧЬЕ:",
  " - Рост hash rate — сеть становится мощнее, майнеры уверены в цене",
  " - MVRV < 1 — цена ниже реализованной стоимости, исторически дно",
  " - NVT низкий — сеть фундаментально недооценена к объёму транзакций",
  " - Halving приближается — исторически предшествует бычьему циклу",
  "🐻 МЕДВЕЖЬЕ:",
  " - Hash rate падает — майнеры капитулируют (sell pressure)",
  " - MVRV > 3.5 — рынок перегрет, исторически зона распределения",
  " - NVT высокий — цена опережает фундаментальное использование сети",
);

addAdvisor({
  advisorName: AdvisorName.AssetFundamentalsAdvisor,
  getChat: async ({ resultId, date, query }: AdvisorRequestContract) => {
    console.log(`AssetFundamentalsAdvisor called with query: ${query}, date: ${date}, resultId: ${resultId}`);
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
        clientId: `${resultId}_asset-fundamentals`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) => console.error(`Error in AssetFundamentalsAdvisor for query ${query}, date ${date}, resultId ${resultId}:`, error),
      },
    );
  },
});
