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

import dayjs from "dayjs";

const DISPLAY_NAME_MAP: Record<string, string> = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  BNBUSDT: "Binance Coin (BNB)",
  XRPUSDT: "Ripple",
  SOLUSDT: "Solana",
};

const FORECAST_PROMPT = str.newline(
  "Ты — портфельный управляющий, который выдаёт ровно один направленный сигнал на следующие 8 часов.",
  "Ты прочитал свечные данные и все аналитические отчёты. Теперь вдумчиво рассуди, прежде чем принять решение.",
  "",
  "**Как думать:**",
  " - Смотри на свечи как на язык рынка: куда идёт цена, где объём подтверждает движение, где нет.",
  " - Новости — катализатор. Свечи — факт. Если свечи противоречат новостям — верь свечам.",
  " - Один сильный сигнал (резкий объём, пробой уровня, крупное событие) перевешивает несколько слабых.",
  " - Противоречия — норма. Разрешай их вопросом: какая сила сейчас сильнее?",
  " - Если картина размыта или сигналы взаимоисключают друг друга — выбирай WAIT.",
  " - Горизонт прогноза: следующие 8 часов.",
  "",
  "**Определения сигналов (выбери ровно один):**",
  " - **BUY**:  Доказательства указывают на рост в ближайшие 8 часов.",
  " - **SELL**: Доказательства указывают на падение в ближайшие 8 часов.",
  " - **WAIT**: Картина неоднозначна, противоречива или неубедительна — не форсируй сделку.",
  "",
  "**Требуемый результат:**",
  "1. **signal**: BUY, SELL или WAIT.",
  "2. **reasoning**: что говорят свечи? Что говорят новости? Где совпадают или расходятся? Почему картина склоняется к этому решению?",
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
        "Прочитай глобальные макроэкономические новости за последние 24 часа и скажи ОК",
        "",
        report,
      ),
    },
    { role: "assistant", content: "ОK" },
  );
};

addOutline<ForecastResponseContract>({
  outlineName: OutlineName.ForecastOutline,
  completion: CompletionName.OllamaOutlineToolCompletion,
  format: {
    type: "object",
    properties: {
      signal: {
        type: "string",
        enum: ["BUY", "SELL", "WAIT"],
        description: "Направленный торговый сигнал на следующие 8 часов.",
      },
      reasoning: {
        type: "string",
        description:
          "Обоснование сигнала: что говорят свечи, что говорят новости, почему картина склоняется к этому решению.",
      },
    },
    required: ["signal", "reasoning"],
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

    await history.push({ role: "user", content: FORECAST_PROMPT });
  },
  validations: [
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
      docDescription: "Проверяет, что сигнал обоснован.",
    },
  ],
  callbacks: {
    async onValidDocument(result) {
      if (!result.data) return;
      await dumpOutlineResult(result, "./dump/outline/forecast");
    },
  },
});
