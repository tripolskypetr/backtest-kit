import {
  addOutline,
  ask,
  dumpOutlineResult,
  IOutlineHistory,
  IOutlineResult,
} from "agent-swarm-kit";
import { str } from "functools-kit";
import { OutlineName } from "../../enum/OutlineName";
import { CompletionName } from "../../enum/CompletionName";
import { AdvisorName } from "../../enum/AdvisorName";
import { WebSearchRequestContract } from "../../contract/WebSearchRequest.contract";
import { ResearchResponseContract } from "../../contract/ResearchResponse.contract";
import { StockDataRequestContract } from "../../contract/StockDataRequest.contract";

import dayjs from "dayjs";
import { errorEmitter } from "../../config/emitters";

const DISPLAY_NAME_MAP: Record<string, string> = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  BNBUSDT: "Binance Coin (BNB)",
  XRPUSDT: "Ripple",
  SOLUSDT: "Solana",
};

const RESEARCH_PROMPT = str.newline(
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
  "3. **entryConfirmation**: конкретное условие, при котором сигнал считается подтверждённым и позицию стоит держать. Привязывай к цене или событию — не к индикаторам.",
  "4. **reversalSignal**: конкретное условие разворота — при котором позицию нужно закрыть. Это наблюдаемый факт на рынке, не стоп в процентах.",
);

const commitAssetNews = async (contract: WebSearchRequestContract, history: IOutlineHistory) => {
  const report = await Promise.race([
    ask<WebSearchRequestContract>(contract, AdvisorName.AssetNewsAdvisor),
    errorEmitter.toPromise(),
  ]);
  if (!report) {
    throw new Error("AssetNewsAdvisor failed");
  }
  if (typeof report === "symbol") {
    throw new Error("AssetNewsAdvisor failed");
  }
  console.log("Asset news report:", report);
  await history.push(
    { role: "user", content: str.newline("Прочитай новости по активу за последние 8 часов и скажи ОК", "", report) },
    { role: "assistant", content: "ОК" },
  );
};

const commitGlobalNews = async (contract: WebSearchRequestContract, history: IOutlineHistory) => {
  const report = await Promise.race([
    ask<WebSearchRequestContract>(contract, AdvisorName.GlobalNewsAdvisor),
    errorEmitter.toPromise(),
  ]);
  if (!report) {
    throw new Error("GlobalNewsAdvisor failed");
  }
  if (typeof report === "symbol") {
    throw new Error("GlobalNewsAdvisor failed");
  }
  console.log("Global news report:", report);
  await history.push(
    { role: "user", content: str.newline("Прочитай глобальные макроэкономические новости за последние 8 часов и скажи ОК", "", report) },
    { role: "assistant", content: "ОK" },
  );
};

const commitStockData = async (contract: StockDataRequestContract, history: IOutlineHistory) => {
  const report = await ask<StockDataRequestContract>(contract, AdvisorName.StockDataAdvisor);
  if (!report) throw new Error("StockDataAdvisor failed");
  await history.push(
    { role: "user", content: str.newline("Прочитай исторические данные свечей и скажи ОК", "", report) },
    { role: "assistant", content: "ОК" },
  );
};

addOutline<ResearchResponseContract>({
  outlineName: OutlineName.ResearchOutline,
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
        description: "Обоснование сигнала: что говорят свечи, что говорят новости, почему картина склоняется к этому решению.",
      },
      entryConfirmation: {
        type: "string",
        description: "Конкретное ценовое или событийное условие, которое должно выполниться чтобы подтвердить сигнал и оставаться в позиции.",
      },
      reversalSignal: {
        type: "string",
        description: "Конкретное условие разворота — при котором позицию нужно закрыть немедленно.",
      },
    },
    required: ["signal", "reasoning", "entryConfirmation", "reversalSignal"],
  },
  getOutlineHistory: async ({ resultId, history }, symbol: string, when: Date) => {
    const displayName = DISPLAY_NAME_MAP[symbol] ?? symbol;

    await history.push({
      role: "system",
      content: str.newline(
        `Текущая дата и время: ${dayjs.utc(when).format("DD MMMM YYYY HH:mm")} UTC`,
        `Актив: ${displayName} (${symbol})`,
      ),
    });

    await commitStockData({
      resultId,
      date: when,
      symbol,
    }, history);

    await commitAssetNews({
      resultId,
      date: when,
      query: displayName,
    }, history);

    await commitGlobalNews({
      resultId,
      date: when,
      query: displayName,
    }, history);

    await history.push({ role: "user", content: RESEARCH_PROMPT });
  },
    validations: [
    {
      validate: ({ data }) => {
        if (!["BUY", "SELL", "WAIT"].includes(data.signal)) throw new Error("signal должен быть BUY, SELL или WAIT");
      },
      docDescription: "Проверяет допустимое значение signal.",
    },
    {
      validate: ({ data }) => {
        if (!data.reasoning) throw new Error("reasoning не заполнен");
      },
      docDescription: "Проверяет, что сигнал обоснован.",
    },
    {
      validate: ({ data }) => {
        if (!data.entryConfirmation) throw new Error("entryConfirmation не заполнен");
      },
      docDescription: "Проверяет, что критерий входа определён.",
    },
    {
      validate: ({ data }) => {
        if (!data.reversalSignal) throw new Error("reversalSignal не заполнен");
      },
      docDescription: "Проверяет, что критерий разворота определён.",
    },
  ],
  callbacks: {
    async onValidDocument(result) {
      if (!result.data) return;
      await dumpOutlineResult(result, "./dump/outline/research");
    },
  },
});
