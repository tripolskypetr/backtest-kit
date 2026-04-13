import {
  addOutline,
  ask,
  dumpOutlineResult,
  IOutlineHistory,
} from "agent-swarm-kit";
import { str } from "functools-kit";
import { OutlineName } from "../../enum/OutlineName";
import { CompletionName } from "../../enum/CompletionName";
import { AdvisorName } from "../../enum/AdvisorName";
import { WebSearchRequestContract } from "../../contract/WebSearchRequest.contract";
import { ResearchResponseContract } from "../../contract/ResearchResponse.contract";
import { formatPrice, formatQuantity, getCandles } from "backtest-kit";
import dayjs from "dayjs";
import { errorEmitter } from "../../config/emitters";

const DISPLAY_NAME_MAP: Record<string, string> = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  BNBUSDT: "Binance Coin (BNB)",
  XRPUSDT: "Ripple",
  SOLUSDT: "Solana",
};

const CANDLES_LIMIT = 96; // 96 x 15m = 24 часа истории

const RESEARCH_PROMPT = str.newline(
  "Ты — внутридневной трейдер, который выдаёт ровно один направленный сигнал на следующий час.",
  "Ты прочитал свечные данные и все аналитические отчёты. Теперь вдумчиво рассуди, прежде чем принять решение.",
  "",
  "**Как думать:**",
  " - Смотри на свечи как на язык рынка: куда идёт цена, где объём подтверждает движение, где нет.",
  " - Новости — катализатор. Свечи — факт. Если свечи противоречат новостям — верь свечам.",
  " - Один сильный сигнал (резкий объём, пробой уровня, крупное событие) перевешивает несколько слабых.",
  " - Если картина размыта или сигналы взаимоисключают друг друга — выбирай WAIT.",
  " - Горизонт прогноза: следующий час.",
  "",
  "**Определения сигналов (выбери ровно один):**",
  " - **BUY**:  Открыть длинную позицию. Доказательства указывают на рост в ближайший час.",
  " - **SELL**: Открыть короткую позицию. Доказательства указывают на падение в ближайший час.",
  " - **WAIT**: Картина неоднозначна, противоречива или неубедительна — не форсируй сделку.",
  "",
  "**Требуемый результат:**",
  "1. **signal**: укажи ровно один из BUY / SELL / WAIT.",
  "2. **reasoning**: что говорят свечи? Что говорят новости? Где они совпадают или расходятся? Почему картина склоняется к этому решению?",
  "3. **entryConfirmation**: конкретное условие, при котором сигнал считается подтверждённым и позицию стоит держать. Привязывай к цене, объёму или событию — не к индикаторам.",
  "4. **reversalSignal**: конкретное условие разворота — при котором позицию нужно закрыть немедленно. Это не стоп-лосс в процентах, а наблюдаемый факт на рынке.",
);

const commitCandles = async (symbol: string, history: IOutlineHistory) => {
  const candles = await getCandles(symbol, "15m", CANDLES_LIMIT);

  let markdown = `## 15-Minute Candles (Last ${CANDLES_LIMIT})\n`;
  markdown += `> Symbol: ${symbol.toUpperCase()}\n\n`;
  markdown += `| # | Time | Open | High | Low | Close | Volume | Change % | Volatility % | Body % |\n`;
  markdown += `|---|------|------|------|-----|-------|--------|----------|--------------|--------|\n`;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const volatility = ((c.high - c.low) / c.close) * 100;
    const bodySize = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const bodyPct = range > 0 ? (bodySize / range) * 100 : 0;
    const changePct = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
    const time = dayjs.utc(c.timestamp).format("YYYY-MM-DD HH:mm") + " UTC";

    const open = await formatPrice(symbol, c.open);
    const high = await formatPrice(symbol, c.high);
    const low = await formatPrice(symbol, c.low);
    const close = await formatPrice(symbol, c.close);
    const volume = formatQuantity(symbol, c.volume);

    markdown += `| ${i + 1} | ${time} | ${open} | ${high} | ${low} | ${close} | ${volume} | ${changePct.toFixed(3)}% | ${volatility.toFixed(2)}% | ${bodyPct.toFixed(1)}% |\n`;
  }

  await history.push(
    { role: "user", content: str.newline("Прочитай историю 15-минутных свечей и скажи ОК", "", markdown) },
    { role: "assistant", content: "ОК" },
  );
};

const commitAssetNews = async (contract: WebSearchRequestContract, history: IOutlineHistory) => {
  const report = await Promise.race([
    ask<WebSearchRequestContract>(contract, AdvisorName.AssetNewsAdvisor),
    errorEmitter.toPromise(),
  ]);
  if (typeof report === "symbol") {
    throw new Error("AssetNewsAdvisor failed with error");
  }
  if (typeof report === "symbol") {
    throw new Error("GlobalNewsAdvisor failed with error");
  }
  if (!report) {
    throw new Error("AssetNewsAdvisor failed");
  }
  await history.push(
    { role: "user", content: str.newline("Прочитай новости по активу за последний час и скажи ОК", "", report) },
    { role: "assistant", content: "ОК" },
  );
};

const commitGlobalNews = async (contract: WebSearchRequestContract, history: IOutlineHistory) => {
  const report = await Promise.race([
    ask<WebSearchRequestContract>(contract, AdvisorName.GlobalNewsAdvisor),
    errorEmitter.toPromise(),
  ]);
  if (typeof report === "symbol") {
    throw new Error("GlobalNewsAdvisor failed with error");
  }
  if (!report) {
    throw new Error("GlobalNewsAdvisor failed");
  }
  await history.push(
    { role: "user", content: str.newline("Прочитай глобальные макроэкономические новости за последний час и скажи ОК", "", report) },
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
        description: "Направленный торговый сигнал на следующий час.",
        enum: ["BUY", "SELL", "WAIT"],
      },
      reasoning: {
        type: "string",
        description: "Обоснование сигнала: что говорят свечи, что говорят новости, почему картина склоняется к этому решению.",
      },
      entryConfirmation: {
        type: "string",
        description: "Конкретное ценовое или событийное условие, которое должно выполниться чтобы подтвердить сигнал и оставаться в позиции. Например: цена держится выше X, объём растёт, новостной фон не меняется.",
      },
      reversalSignal: {
        type: "string",
        description: "Конкретное условие разворота — при котором позицию нужно закрыть. Например: цена пробивает уровень Y вниз, появляется противоположный новостной катализатор, объём резко растёт против позиции.",
      },
    },
    required: ["signal", "reasoning", "entryConfirmation", "reversalSignal"],
  },
  getOutlineHistory: async ({ resultId, history }, symbol: string, when: Date) => {
    const displayName = DISPLAY_NAME_MAP[symbol] ?? symbol;
    const contract: WebSearchRequestContract = {
      resultId,
      date: when,
      query: displayName,
    };

    await history.push({
      role: "system",
      content: str.newline(
        `Текущая дата и время: ${dayjs.utc(when).format("DD MMMM YYYY HH:mm")} UTC`,
        `Торгуемый актив: ${displayName} (${symbol})`,
      ),
    });

    await commitCandles(symbol, history);
    await commitAssetNews(contract, history);
    await commitGlobalNews(contract, history);

    await history.push({ role: "user", content: RESEARCH_PROMPT });
  },
  validations: [
    {
      validate: ({ data }) => {
        if (!data.signal) {
          throw new Error("Поле signal не заполнено");
        }
      },
      docDescription: "Проверяет, что сигнал определён.",
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
        throw new Error("Поле signal должно быть BUY, SELL или WAIT");
      },
      docDescription: "Проверяет, что signal содержит допустимое значение.",
    },
    {
      validate: ({ data }) => {
        if (!data.reasoning) {
          throw new Error("Поле reasoning не заполнено");
        }
      },
      docDescription: "Проверяет, что сигнал обоснован.",
    },
    {
      validate: ({ data }) => {
        if (!data.entryConfirmation) {
          throw new Error("Поле entryConfirmation не заполнено");
        }
      },
      docDescription: "Проверяет, что критерий подтверждения входа определён.",
    },
    {
      validate: ({ data }) => {
        if (!data.reversalSignal) {
          throw new Error("Поле reversalSignal не заполнено");
        }
      },
      docDescription: "Проверяет, что критерий разворота определён.",
    },
  ],
  callbacks: {
    async onValidDocument(result) {
      if (!result.data) {
        return;
      }
      await dumpOutlineResult(result, "./dump/outline/research");
    },
  },
});
