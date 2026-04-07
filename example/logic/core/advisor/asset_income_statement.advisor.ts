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
  "Отчёт о прибылях и убытках компании",
  "",
  "Для Bitcoin аналог доходности сети и экосистемы (запросы для web_search):",
  " - Bitcoin Lightning Network capacity revenue {date}",
  " - Bitcoin transaction fees revenue {date}",
  " - Bitcoin miner profitability hashprice {date}",
  " - Bitcoin DeFi TVL ecosystem {date}",
  " - Bitcoin Ordinals inscription activity revenue {date}",
  " - Bitcoin layer2 activity revenue {date}",
  "",
  "Влияние на фундаментальный анализ:",
  "🐂 БЫЧЬЕ:",
  " - Рост транзакционных комиссий — сеть активно используется, спрос на блок-пространство",
  " - Рост hashprice — майнинг рентабелен, сеть устойчива",
  " - Рост TVL в экосистеме Bitcoin (Lightning, Stacks) — utility растёт",
  " - Высокая активность Ordinals/Inscriptions — новый спрос на блокчейн",
  "🐻 МЕДВЕЖЬЕ:",
  " - Падение комиссий до минимума — сеть не загружена, нет спроса",
  " - Hashprice падает — майнеры на грани рентабельности, возможна капитуляция",
  " - Снижение TVL в экосистеме — интерес разработчиков и пользователей падает",
);

addAdvisor({
  advisorName: AdvisorName.AssetIncomeStatementAdvisor,
  getChat: async ({ resultId, date, query }: AdvisorRequestContract) => {
    console.log(`AssetIncomeStatementAdvisor called with query: ${query}, date: ${date}, resultId: ${resultId}`);
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
        clientId: `${resultId}_asset-income-statement`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) => console.error(`Error in AssetIncomeStatementAdvisor for query ${query}, date ${date}, resultId ${resultId}:`, error),
      },
    );
  },
});
