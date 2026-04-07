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
  "Исторические данные тикера (цена + объём по дням).",
  "",
  "Искомые метрики (запросы для web_search):",
  " - Bitcoin OHLCV daily data {date}",
  " - BTC price history {start_date} to {end_date}",
  " - Bitcoin trading volume spike {date}",
  " - BTC daily candle close {date}",
  "",
  "Влияние на фундаментальный анализ:",
  "🐂 БЫЧЬЕ:",
  " - Серия закрытий выше предыдущих хаёв — восходящий тренд подтверждён",
  " - Резкий рост объёма при росте цены — институциональный спрос",
  " - Выход из многонедельного диапазона с объёмом (breakout)",
  "🐻 МЕДВЕЖЬЕ:",
  " - Серия более низких закрытий (lower lows) — нисходящий тренд",
  " - Высокий объём при падении — агрессивные продажи",
  " - Возврат после пробоя без объёмного подтверждения (false breakout)",
);

addAdvisor({
  advisorName: AdvisorName.StockDataAdvisor,
  getChat: async ({ resultId, date, query }: AdvisorRequestContract) => {
    console.log(`StockDataAdvisor called with query: ${query}, date: ${date}, resultId: ${resultId}`);
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
        clientId: `${resultId}_stock-data`,
        swarmName: SwarmName.WebSearchSwarm,
        onError: (error) => console.error(`Error in StockDataAdvisor for query ${query}, date ${date}, resultId ${resultId}:`, error),
      },
    );
  },
});
