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
  "Денежный поток компании",
  "",
  "Для Bitcoin аналог потоков капитала (запросы для web_search):",
  " - Bitcoin miner selling pressure {date} flow",
  " - Bitcoin ETF net inflow outflow {date}",
  " - Bitcoin stablecoin inflow to exchanges {date}",
  " - Bitcoin whale transactions {date} large transfer",
  " - Bitcoin OTC desk volume {date}",
  " - Bitcoin futures open interest {date} change",
  "",
  " Влияние на фундаментальный анализ:",
  " 🐂 БЫЧЬЕ:",
  " - ETF чистый приток (net inflow) — институциональный спрос растёт",
  " - Стейблкоины притекают на биржи — готовность покупать",
  " - OTC объёмы растут — крупные игроки аккумулируют вне стакана",
  " - Майнеры не продают (miner net position positive) — уверены в росте",
  "🐻 МЕДВЕЖЬЕ:",
  " - ETF чистый отток — институциональные деньги уходят",
  " - Стейблкоины утекают с бирж — спрос на покупку иссякает",
  " - Майнеры активно продают — давление предложения",
  " - Резкий рост open interest без роста цены — перегрев деривативов,",
  " - Рост liquid supply — давление продавцов нарастает",
);

addAdvisor({
  advisorName: AdvisorName.AssetCashflowAdvisor,
  getChat: async ({ resultId, date, query }: AdvisorRequestContract) => {
    console.log(`AssetCashflowAdvisor called with query: ${query}, date: ${date}, resultId: ${resultId}`);
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
        clientId: `${resultId}_asset-cashflow`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) => console.error(`Error in AssetCashflowAdvisor for query ${query}, date ${date}, resultId ${resultId}:`, error),
      },
    );
  },
});
