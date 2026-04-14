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
import { GridResponseContract } from "../../contract/GridResponse.contract";
import { StockDataRequestContract } from "../../contract/StockDataRequest.contract";

import dayjs from "dayjs";

const DISPLAY_NAME_MAP: Record<string, string> = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  BNBUSDT: "Binance Coin (BNB)",
  XRPUSDT: "Ripple",
  SOLUSDT: "Solana",
};

const GRID_PROMPT = str.newline(
  "Ты — трейдер, который строит сетку лимитных ордеров на 8 часов на основе собранных данных.",
  "",
  "**Задача:**",
  "Прочитай свечные данные и новостные отчёты. Определи:",
  " - Текущую цену (последний Close из свечей)",
  " - Уровни поддержки и сопротивления (по структуре свечей: локальные минимумы/максимумы, зоны консолидации)",
  " - Общий bias и уверенность",
  "",
  "**Правила построения сетки:**",
  " - confidence HIGH + bias BULLISH → gridSide: BUY, ордера у support уровней",
  " - confidence HIGH + bias BEARISH → gridSide: SELL, ордера у resistance уровней",
  " - confidence MEDIUM → gridSide по bias, но уровней меньше",
  " - confidence LOW или bias NEUTRAL → gridSide: BOTH, ордера в обе стороны",
  "",
  " - Каждый gridLevel — конкретная цена из структуры свечей",
  " - BUY ордера размещаются на уровне support или чуть ниже",
  " - SELL ордера размещаются на уровне resistance или чуть выше",
  " - stopLoss должен выдержать нормальную волатильность за 8 часов — не слишком тесный;",
  "   для BUY grid — ниже самого нижнего support; для SELL grid — выше самого верхнего resistance;",
  "   для BOTH — по более широкому из двух",
  "",
  "**Требуемый результат:**",
  "1. **bias**: BULLISH, BEARISH или NEUTRAL",
  "2. **confidence**: HIGH, MEDIUM или LOW",
  "3. **currentPrice**: последний Close из свечей",
  "4. **support**: ближайшие 2-3 уровня поддержки",
  "5. **resistance**: ближайшие 2-3 уровня сопротивления",
  "6. **gridSide**: BUY, SELL или BOTH",
  "7. **gridLevels**: массив ордеров с price, side и note (почему этот уровень)",
  "8. **stopLoss**: единый стоп для всей сетки",
  "9. **reasoning**: почему такая конфигурация — коротко, по делу",
);

const commitAssetNews = async (contract: WebSearchRequestContract, history: IOutlineHistory) => {
  const report = await ask<WebSearchRequestContract>(contract, AdvisorName.AssetNewsAdvisor);
  if (!report) throw new Error("AssetNewsAdvisor failed");
  await history.push(
    { role: "user", content: str.newline("Прочитай новости по активу за последние 8 часов и скажи ОК", "", report) },
    { role: "assistant", content: "ОК" },
  );
};

const commitGlobalNews = async (contract: WebSearchRequestContract, history: IOutlineHistory) => {
  const report = await ask<WebSearchRequestContract>(contract, AdvisorName.GlobalNewsAdvisor);
  if (!report) throw new Error("GlobalNewsAdvisor failed");
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

addOutline<GridResponseContract>({
  outlineName: OutlineName.GridOutline,
  completion: CompletionName.OllamaOutlineToolCompletion,
  format: {
    type: "object",
    properties: {
      bias: {
        type: "string",
        enum: ["BULLISH", "BEARISH", "NEUTRAL"],
        description: "Общий bias на основе данных.",
      },
      confidence: {
        type: "string",
        enum: ["LOW", "MEDIUM", "HIGH"],
        description: "Уверенность в сигнале.",
      },
      currentPrice: {
        type: "number",
        description: "Текущая цена — последний Close из свечей.",
      },
      support: {
        type: "array",
        items: { type: "number" },
        description: "Уровни поддержки из структуры свечей.",
      },
      resistance: {
        type: "array",
        items: { type: "number" },
        description: "Уровни сопротивления из структуры свечей.",
      },
      gridSide: {
        type: "string",
        enum: ["BUY", "SELL", "BOTH"],
        description: "Направление сетки.",
      },
      gridLevels: {
        type: "array",
        items: {
          type: "object",
          properties: {
            price: { type: "number" },
            side: { type: "string", enum: ["BUY", "SELL"] },
            note: { type: "string" },
          },
          required: ["price", "side", "note"],
        },
        description: "Конкретные уровни ордеров сетки.",
      },
      stopLoss: {
        type: "number",
        description: "Единый стоп-уровень для всей сетки.",
      },
      reasoning: {
        type: "string",
        description: "Обоснование конфигурации сетки.",
      },
    },
    required: ["bias", "confidence", "currentPrice", "support", "resistance", "gridSide", "gridLevels", "stopLoss", "reasoning"],
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

    await history.push({ role: "user", content: GRID_PROMPT });
  },
  validations: [
    {
      validate: ({ data }) => {
        if (!data.currentPrice || data.currentPrice <= 0) throw new Error("currentPrice не задан или <= 0");
      },
      docDescription: "Проверяет, что текущая цена задана и положительна.",
    },
    {
      validate: ({ data }) => {
        if (!data.support?.length) throw new Error("support пустой");
      },
      docDescription: "Проверяет, что уровни поддержки заданы.",
    },
    {
      validate: ({ data }) => {
        if (!data.resistance?.length) throw new Error("resistance пустой");
      },
      docDescription: "Проверяет, что уровни сопротивления заданы.",
    },
    {
      validate: ({ data }) => {
        if (!data.gridLevels?.length) throw new Error("gridLevels пустой");
      },
      docDescription: "Проверяет, что сетка содержит хотя бы один уровень.",
    },
    {
      validate: ({ data }) => {
        const invalid = data.gridLevels.find((l) => !l.price || l.price <= 0);
        if (invalid) throw new Error(`gridLevel с некорректной ценой: ${JSON.stringify(invalid)}`);
      },
      docDescription: "Проверяет, что каждый уровень сетки имеет корректную цену.",
    },
    {
      validate: ({ data }) => {
        const invalid = data.gridLevels.find((l) => l.side !== "BUY" && l.side !== "SELL");
        if (invalid) throw new Error(`gridLevel с некорректным side: ${JSON.stringify(invalid)}`);
      },
      docDescription: "Проверяет, что каждый уровень сетки имеет допустимое значение side.",
    },
    {
      validate: ({ data }) => {
        if (data.gridSide === "BUY") {
          const wrongSide = data.gridLevels.find((l) => l.side !== "BUY");
          if (wrongSide) throw new Error(`gridSide=BUY, но найден уровень SELL: ${JSON.stringify(wrongSide)}`);
          const minSupport = Math.min(...data.support);
          if (data.stopLoss >= minSupport) throw new Error(`stopLoss (${data.stopLoss}) должен быть ниже минимального support (${minSupport})`);
        }
      },
      docDescription: "Для BUY grid: все уровни BUY, стоп ниже минимального support.",
    },
    {
      validate: ({ data }) => {
        if (data.gridSide === "SELL") {
          const wrongSide = data.gridLevels.find((l) => l.side !== "SELL");
          if (wrongSide) throw new Error(`gridSide=SELL, но найден уровень BUY: ${JSON.stringify(wrongSide)}`);
          const maxResistance = Math.max(...data.resistance);
          if (data.stopLoss <= maxResistance) throw new Error(`stopLoss (${data.stopLoss}) должен быть выше максимального resistance (${maxResistance})`);
        }
      },
      docDescription: "Для SELL grid: все уровни SELL, стоп выше максимального resistance.",
    },
    {
      validate: ({ data }) => {
        if (data.gridSide === "BOTH") {
          const hasBuy = data.gridLevels.some((l) => l.side === "BUY");
          const hasSell = data.gridLevels.some((l) => l.side === "SELL");
          if (!hasBuy || !hasSell) throw new Error("gridSide=BOTH, но отсутствуют уровни одной из сторон");
        }
      },
      docDescription: "Для BOTH grid: есть хотя бы один BUY и один SELL уровень.",
    },
    {
      validate: ({ data }) => {
        if (!data.stopLoss || data.stopLoss <= 0) throw new Error("stopLoss не задан или <= 0");
      },
      docDescription: "Проверяет, что стоп задан и положителен.",
    },
    {
      validate: ({ data }) => {
        if (!data.reasoning) throw new Error("reasoning не заполнен");
      },
      docDescription: "Проверяет, что сетка обоснована.",
    },
  ],
  callbacks: {
    async onValidDocument(result: IOutlineResult<GridResponseContract>) {
      if (!result.data) return;
      await dumpOutlineResult(result, "./dump/outline/grid");
    },
  },
});
