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
  "Макроэкономические и крипторыночные новости — глобальный контекст без привязки к тикеру.",
  "",
  "Искомые метрики (запросы для web_search):",
  " - Fed interest rate decision {date} crypto impact",
  " - CPI inflation data {date} Bitcoin reaction",
  " - US dollar index DXY {date} crypto correlation",
  " - global crypto market cap {date} trend",
  " - Bitcoin dominance BTC.D {date}",
  " - crypto fear and greed index {date}",
  " - FOMC meeting minutes {date} risk assets",
  " - global liquidity M2 money supply {date} Bitcoin",
  " - stock market S&P500 correlation Bitcoin {date}",
  " - stablecoin USDT USDC supply change {date}",
  "",
  "Влияние на фундаментальный анализ:",
  "🐂 БЫЧЬЕ:",
  " - Снижение ставки ФРС — рост аппетита к риску, приток в крипту",
  " - Слабый DXY — альтернативные активы растут относительно доллара",
  " - Рост глобальной ликвидности (M2) — исторически коррелирует с BTC",
  " - Fear & Greed Index в зоне страха (< 25) — контрарианный сигнал на покупку",
  " - Рост доминации BTC — переток капитала в биткоин из альтов",
  " - Рост supply стейблкоинов — сухой порох на бирже, готовность к покупке",
  "🐻 МЕДВЕЖЬЕ:",
  " - Повышение ставки ФРС — бегство из рисковых активов",
  " - Сильный DXY — давление на все risk-on активы",
  " - Fear & Greed > 80 (экстремальная жадность) — перегрев, риск коррекции",
  " - Рост доходности трежерей — конкурент для крипты как инструмент доходности",
  " - Падение S&P 500 — корреляция с крипторынком в период паники",
);

addAdvisor({
  advisorName: AdvisorName.GlobalNewsAdvisor,
  getChat: async ({ resultId, date, query }: AdvisorRequestContract) => {
    console.log(`GlobalNewsAdvisor called with query: ${query}, date: ${date}, resultId: ${resultId}`);
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
        clientId: `${resultId}_global-news`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) => console.error(`Error in GlobalNewsAdvisor for query ${query}, date ${date}, resultId ${resultId}:`, error),
      },
    );
  },
});
