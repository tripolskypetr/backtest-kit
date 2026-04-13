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
import { WebSearchRequestContract } from "../../contract/WebSearchRequest.contract";

const SEARCH_PROMPT = str.newline(
  "Макроэкономические и крипторыночные новости за последний час — глобальный контекст без привязки к тикеру.",
  "",
  "Искомые метрики (запросы для web_search):",
  " - crypto market news last hour {datetime}",
  " - Fed speech statement {datetime}",
  " - US dollar DXY movement {datetime}",
  " - global crypto market cap change {datetime}",
  " - crypto fear and greed index {datetime}",
  " - S&P500 futures {datetime}",
  " - stablecoin USDT USDC flow {datetime}",
  " - Bitcoin dominance change {datetime}",
  "",
  "Влияние на краткосрочное движение цены (1 час):",
  "🐂 БЫЧЬЕ:",
  " - Неожиданно мягкое заявление ФРС",
  " - Рост стейблкоин inflow на биржи",
  " - Рост крипто market cap без BTC — альт-сезон",
  " - Падение DXY — risk-on",
  "🐻 МЕДВЕЖЬЕ:",
  " - Hawkish заявление ФРС / ужесточение",
  " - Резкий рост DXY",
  " - Падение S&P500 futures — risk-off",
  " - Outflow стейблкоинов с бирж",
);

addAdvisor({
  advisorName: AdvisorName.GlobalNewsAdvisor,
  getChat: async ({ resultId, date, query }: WebSearchRequestContract) => {
    console.log(`HourlyGlobalNewsAdvisor called with query: ${query}, date: ${date}`);
    return await fork(
      async (clientId, agentName) => {
        await commitUserMessage(
          str.newline("Прочитай что именно мне нужно найти и скажи ОK", "", SEARCH_PROMPT),
          "user",
          clientId,
          agentName,
        );

        await commitAssistantMessage("OK", clientId, agentName);

        const request = str.newline(
          `Найди в интернете нужную мне информацию для ${query}`,
          `Дай только последние новости актуальные на ${dayjs.utc(date).format("DD MMMM YYYY HH:mm")} UTC`,
          `Ищи новости за последний час`,
          `Сформируй отчет влияющий на краткосрочное движение цены`,
        );

        return await execute(request, clientId, agentName);
      },
      {
        clientId: `${resultId}_hourly-global-news`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) =>
          console.error(`Error in HourlyGlobalNewsAdvisor for query ${query}:`, error),
      },
    );
  },
});
