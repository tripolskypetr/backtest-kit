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
 "Инсайдерские сделки акционеров компании",
 "",
 "Для Bitcoin аналог `умных денег`` и крупных участников (запросы для web_search):",
 " - Bitcoin whale accumulation {date} on-chain",
 " - Bitcoin Satoshi wallet movement {date}",
 " - Bitcoin early miner wallet activity {date}",
 " - Michael Saylor MicroStrategy Bitcoin purchase {date}",
 " - BlackRock Bitcoin ETF holdings change {date}",
 " - Bitcoin government wallet movement {date} seized",
 " - Bitcoin Grayscale GBTC holdings change {date}",
 " - Bitcoin core developer wallet activity {date}",
 "",
 "Влияние на фундаментальный анализ:",
 "🐂 БЫЧЬЕ:",
 " - Крупные институциональные покупки (MicroStrategy, ETF наращивает позиции)",
 " - Накопление на whale-адресах (1000+ BTC) без движения к биржам",
 " - Правительственные кошельки не двигаются — конфискованный BTC не продаётся",
 " - Grayscale прекратил продажи, GBTC premium восстанавливается",
 "🐻 МЕДВЕЖЬЕ:",
 " - Крупные адреса переводят BTC на биржи — потенциальная продажа",
 " - Правительство (США, Германия и др.) продаёт конфискованный BTC",
 " - Ранние майнеры активизировались — историческое предупреждение о коррекции",
 " - GBTC discount расширяется — институциональный выход из позиций",
);

addAdvisor({
  advisorName: AdvisorName.AssetInsiderTransactionsAdvisor,
  getChat: async ({ resultId, date, query }: AdvisorRequestContract) => {
    console.log(`AssetInsiderTransactionsAdvisor called with query: ${query}, date: ${date}, resultId: ${resultId}`);
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
        clientId: `${resultId}_asset-insider-transactions`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) => console.error(`Error in AssetInsiderTransactionsAdvisor for query ${query}, date ${date}, resultId ${resultId}:`, error),
      },
    );
  },
});
