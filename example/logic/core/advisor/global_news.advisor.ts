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
import { WebSearchRequestContract } from "../../contract/WebSearchRequest.contract";
dayjs.extend(utc);

const SEARCH_PROMPT = str.newline(
  "Макроэкономические и крипторыночные новости за последние 8 часов — глобальный контекст.",
  "",
  "Искомые метрики (запросы для web_search):",
  " - crypto market news last 8 hours {datetime}",
  " - Fed speech statement {datetime}",
  " - US dollar DXY movement {datetime}",
  " - global crypto market cap change {datetime}",
  " - crypto fear and greed index {datetime}",
  " - S&P500 futures {datetime}",
  " - stablecoin USDT USDC flow {datetime}",
  " - Bitcoin dominance change {datetime}",
  " - US economic data release {datetime}",
  "",
  "Влияние на построение сетки (8-часовой горизонт):",
  "🐂 БЫЧЬЕ:",
  " - Мягкое заявление ФРС / пауза ужесточения",
  " - Рост стейблкоин inflow на биржи",
  " - Падение DXY — risk-on",
  " - Рост крипто market cap",
  "🐻 МЕДВЕЖЬЕ:",
  " - Hawkish заявление ФРС",
  " - Резкий рост DXY",
  " - Падение S&P500 futures — risk-off",
  " - Outflow стейблкоинов с бирж",
);

addAdvisor({
  advisorName: AdvisorName.GlobalNewsAdvisor,
  getChat: async ({ resultId, date, query }: WebSearchRequestContract) => {
    console.log(`GlobalNewsAdvisor called with query: ${query}, date: ${date}`);
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
        clientId: `${resultId}_global-news`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) => console.error(`Error in GlobalNewsAdvisor for query ${query}:`, error),
      },
    );
  },
});
