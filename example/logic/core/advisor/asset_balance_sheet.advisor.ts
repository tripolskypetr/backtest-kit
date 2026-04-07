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
  "Баланс компании (активы, обязательства, капитал)",
  "",
  "Для Bitcoin аналог on-chain балансовых метрик (запросы для web_search):",
  " - Bitcoin exchange reserves {date} outflow inflow",
  " - Bitcoin long-term holder supply {date}",
  " - Bitcoin illiquid supply ratio {date}",
  " - Bitcoin HODL waves {date} distribution",
  " - Bitcoin cold wallet accumulation {date}",
  "",
  "Влияние на фундаментальный анализ:",
  "🐂 БЫЧЬЕ:",
  " - Отток BTC с бирж — монеты уходят в холодные кошельки (накопление)",
  " - Рост доли долгосрочных холдеров (LTH) — «слабые руки» вышли",
  " - Illiquid Supply растёт — доступного для продажи BTC всё меньше",
  "🐻 МЕДВЕЖЬЕ:",
  " - Приток BTC на биржи — готовность к продаже",
  " - Снижение доли LTH — долгосрочные держатели фиксируют прибыль",
  " - Рост liquid supply — давление продавцов нарастает",
);

addAdvisor({
  advisorName: AdvisorName.AssetBalanceSheetAdvisor,
  getChat: async ({ resultId, date, query }: AdvisorRequestContract) => {
    console.log(`AssetBalanceSheetAdvisor called with query: ${query}, date: ${date}, resultId: ${resultId}`);
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
        clientId: `${resultId}_asset-balance-sheet`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) => console.error(`Error in AssetBalanceSheetAdvisor for query ${query}, date ${date}, resultId ${resultId}:`, error),
      },
    );
  },
});
