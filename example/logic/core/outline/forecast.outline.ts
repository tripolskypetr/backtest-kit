import {
  addOutline,
  ask,
  dumpOutlineResult,
  IOutlineHistory,
} from "agent-swarm-kit";
import { not, str } from "functools-kit";
import { OutlineName } from "../../enum/OutlineName";
import { CompletionName } from "../../enum/CompletionName";
import { AdvisorName } from "../../enum/AdvisorName";
import { WebSearchRequestContract } from "../../contract/WebSearchRequest.contract";
import { ForecastResponseContract } from "../../contract/ForecastResponse.contract";
import { StockDataRequestContract } from "../../contract/StockDataRequest.contract";

import dayjs from "dayjs";

const DISPLAY_NAME_MAP: Record<string, string> = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  BNBUSDT: "Binance Coin (BNB)",
  XRPUSDT: "Ripple",
  SOLUSDT: "Solana",
};

const FORECAST_PROMPT = str.newline(
  "Ты — аналитик, который сопоставляет макроновости со свечными данными.",
  "Новости определяют критические уровни и ожидания рынка. Свечи — факт того, что произошло.",
  "Твоя задача: проверить, подтверждают ли свечи то, что предполагают новости.",
  "",
  "**Алгоритм:**",
  " 1. Из новостей выдели ключевые события: что должно давить на цену вниз, что тянуть вверх.",
  " 2. Посмотри на свечи: цена движется в направлении, которое предполагают новости, или против?",
  " 3. Если направление совпадает — сентимент подтверждён. Если цена идёт против новостей — рынок не верит в нарратив.",
  " 4. sideways — только если новости прямо противоречат друг другу И свечи не дают направления.",
  "",
  "**Сентимент (выбери ровно один):**",
  " - **bullish**: новости позитивны, свечи подтверждают рост.",
  " - **bearish**: новости негативны, свечи подтверждают падение.",
  " - **neutral**: новости без выраженного направления, свечи спокойны.",
  " - **sideways**: новости противоречат друг другу, свечи не дают чёткого направления.",
  "",
  "**Сигнал (выбери ровно один):**",
  " - **BUY**: сегодня хороший день для покупки — bullish сентимент подтверждён свечами.",
  " - **SELL**: сегодня хороший день для продажи — bearish сентимент подтверждён свечами.",
  " - **WAIT**: сентимент neutral или sideways, либо свечи не подтверждают новостной нарратив.",
  "",
  "**Требуемый результат:**",
  "1. **sentiment**: bullish, bearish, neutral или sideways.",
  "2. **signal**: BUY, SELL или WAIT.",
  "3. **reasoning**: какие новости создали ожидание? Что показывают свечи? Совпадает или расходится?",
);

const commitGlobalNews = async (
  contract: WebSearchRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<WebSearchRequestContract>(contract, AdvisorName.TavilyNewsAdvisor);
  await history.push(
    {
      role: "user",
      content: str.newline(
        "Прочитай глобальные макроэкономические новости за последние 24 часа, запомни их и скажи ОК",
        "",
        report,
      ),
    },
    { role: "assistant", content: "ОK" },
  );
};

const commitStockData = async (
  contract: StockDataRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<StockDataRequestContract>(
    contract,
    AdvisorName.StockDataAdvisor,
  );
  if (!report) {
    throw new Error("StockDataAdvisor failed");
  }
  await history.push(
    {
      role: "user",
      content: str.newline(
        "Прочитай исторические данные свечей и скажи ОК",
        "",
        report,
      ),
    },
    { role: "assistant", content: "ОК" },
  );
};


addOutline<ForecastResponseContract>({
  outlineName: OutlineName.ForecastOutline,
  completion: CompletionName.OllamaOutlineToolCompletion,
  format: {
    type: "object",
    properties: {
      sentiment: {
        type: "string",
        enum: ["bullish", "bearish", "neutral", "sideways"],
        description: "Рыночный сентимент: совпадение новостного нарратива и свечного движения.",
      },
      signal: {
        type: "string",
        enum: ["BUY", "SELL", "WAIT"],
        description: "Торговый сигнал на текущий день.",
      },
      reasoning: {
        type: "string",
        description: "Что говорят новости, что показывают свечи, совпадают ли они.",
      },
    },
    required: ["sentiment", "signal", "reasoning"],
  },
  getOutlineHistory: async (
    { resultId, history },
    symbol: string,
    when: Date,
  ) => {
    const displayName = DISPLAY_NAME_MAP[symbol] ?? symbol;

    await history.push({
      role: "system",
      content: str.newline(
        `Текущая дата и время: ${dayjs.utc(when).format("DD MMMM YYYY HH:mm")} UTC`,
        `Актив: ${displayName} (${symbol})`,
      ),
    });

    await commitGlobalNews(
      {
        resultId,
        from: dayjs(when).subtract(1, 'day').toDate(),
        to: when,
        query: displayName,
      },
      history,
    );

    await commitStockData(
      {
        resultId,
        symbol,
        date: when,
      },
      history,
    );

    await history.push({ role: "user", content: FORECAST_PROMPT });
  },
  validations: [
    {
      validate: ({ data }) => {
        if (data.sentiment === "bullish") {
          return;
        }
        if (data.sentiment === "bearish") {
          return;
        }
        if (data.sentiment === "neutral") {
          return;
        }
        if (data.sentiment === "sideways") {
          return;
        }
        throw new Error("sentiment должен быть bullish, bearish, neutral или sideways");
      },
      docDescription: "Проверяет допустимое значение sentiment.",
    },
    {
      validate: ({ data }) => {
        if (data.signal === "BUY") {
          return;
        }
        if (data.signal === "SELL") {
          return;
        }
        if (data.signal === "WAIT") {
          return;
        }
        throw new Error("signal должен быть BUY, SELL или WAIT");
      },
      docDescription: "Проверяет допустимое значение signal.",
    },
    {
      validate: ({ data }) => {
        if (!data.reasoning) throw new Error("reasoning не заполнен");
      },
      docDescription: "Проверяет, что решение обосновано.",
    },
  ],
  callbacks: {
    async onValidDocument(result) {
      if (!result.data) return;
      await dumpOutlineResult(result, "./dump/outline/forecast");
    },
  },
});
