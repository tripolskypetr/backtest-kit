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
import { AdvisorRequestContract } from "../../contract/AdvisorRequest.contract";
import { ResearchResponseContract } from "../../contract/ResearchResponse.contract";

const DISPLAY_NAME_MAP = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  BNBUSDT: "Binance Coin (BNB)",
  XRPUSDT: "Ripple",
  SOLUSDT: "Solana",
};

const RESEARCH_PROMPT = str.newline(
  "Ты — портфельный управляющий, который выдаёт ровно один направленный сигнал в день.",
  "Ты прочитал все аналитические отчёты. Теперь вдумчиво рассуди, прежде чем принять решение.",
  "",
  "**Как думать:**",
  " - Воспринимай отчёты как единую картину, а не список пунктов. Спроси себя: какую историю они рассказывают вместе?",
  " - Взвешивай сигналы по их убедительности и актуальности для текущего рыночного режима.",
  " - Один сильный сигнал (например, смена макрорежима или крупный институциональный поток) может перевесить несколько слабых.",
  " - Противоречия — норма. Разрешай их вопросом: какая сила сейчас сильнее, а не у кого больше аргументов.",
  " - Действуй только тогда, когда картина складывается в связную историю. Если картина размыта — выбирай WAIT.",
  "",
  "**Определения сигналов (выбери ровно один):**",
  " - **BUY**:  Открыть длинную позицию. Доказательства указывают на явную возможность роста.",
  " - **SELL**: Открыть короткую позицию. Доказательства указывают на явный риск падения.",
  " - **WAIT**: Картина неоднозначна, противоречива или неубедительна — не форсируй сделку.",
  "",
  "**Требуемый результат:**",
  "1. **Сигнал**: укажи ровно один из BUY / SELL / WAIT.",
  "2. **Рассуждение**: пройдись по своей логике. Какова доминирующая тема? В чём ключевые противоречия? Почему доказательства склоняются в эту сторону — или почему они вообще не склоняются?",
);

const commitAssetBalanceSheet = async (
  contract: AdvisorRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<AdvisorRequestContract>(
    contract,
    AdvisorName.AssetBalanceSheetAdvisor,
  );
  if (!report) {
    throw new Error("AssetBalanceSheetAdvisor failed");
  }
  await history.push(
    {
      role: "user",
      content: str.newline(
        "Прочитай отчет о балансе компании и скажи ОК",
        "",
        report,
      ),
    },
    {
      role: "assistant",
      content: "ОК",
    },
  );
};

const commitAssetCashflow = async (
  contract: AdvisorRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<AdvisorRequestContract>(
    contract,
    AdvisorName.AssetCashflowAdvisor,
  );
  if (!report) {
    throw new Error("AssetCashflowAdvisor failed");
  }
  await history.push(
    {
      role: "user",
      content: str.newline(
        "Прочитай отчет о денежном потоке компании и скажи ОК",
        "",
        report,
      ),
    },
    {
      role: "assistant",
      content: "ОК",
    },
  );
};

const commitAssetFundamentals = async (
  contract: AdvisorRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<AdvisorRequestContract>(
    contract,
    AdvisorName.AssetFundamentalsAdvisor,
  );
  if (!report) {
    throw new Error("AssetFundamentalsAdvisor failed");
  }
  await history.push(
    {
      role: "user",
      content: str.newline(
        "Прочитай отчет о фундаментальных данных компании и скажи ОК",
        "",
        report,
      ),
    },
    {
      role: "assistant",
      content: "ОК",
    },
  );
};

const commitAssetIncomeStatement = async (
  contract: AdvisorRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<AdvisorRequestContract>(
    contract,
    AdvisorName.AssetIncomeStatementAdvisor,
  );
  if (!report) {
    throw new Error("AssetIncomeStatementAdvisor failed");
  }
  await history.push(
    {
      role: "user",
      content: str.newline(
        "Прочитай отчет о прибылях и убытках компании и скажи ОК",
        "",
        report,
      ),
    },
    {
      role: "assistant",
      content: "ОК",
    },
  );
};

const commitAssetInsiderTransactions = async (
  contract: AdvisorRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<AdvisorRequestContract>(
    contract,
    AdvisorName.AssetInsiderTransactionsAdvisor,
  );
  if (!report) {
    throw new Error("AssetInsiderTransactionsAdvisor failed");
  }
  await history.push(
    {
      role: "user",
      content: str.newline(
        "Прочитай отчет об инсайдерских сделках и скажи ОК",
        "",
        report,
      ),
    },
    {
      role: "assistant",
      content: "ОК",
    },
  );
};

const commitAssetNews = async (
  contract: AdvisorRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<AdvisorRequestContract>(
    contract,
    AdvisorName.AssetNewsAdvisor,
  );
  if (!report) {
    throw new Error("AssetNewsAdvisor failed");
  }
  await history.push(
    {
      role: "user",
      content: str.newline("Прочитай новости по активу и скажи ОК", "", report),
    },
    {
      role: "assistant",
      content: "ОК",
    },
  );
};

const commitGlobalNews = async (
  contract: AdvisorRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<AdvisorRequestContract>(
    contract,
    AdvisorName.GlobalNewsAdvisor,
  );
  if (!report) {
    throw new Error("GlobalNewsAdvisor failed");
  }
  await history.push(
    {
      role: "user",
      content: str.newline(
        "Прочитай глобальные макроэкономические новости и скажи ОК",
        "",
        report,
      ),
    },
    {
      role: "assistant",
      content: "ОК",
    },
  );
};

const commitStockData = async (
  contract: AdvisorRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<AdvisorRequestContract>(
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
        "Прочитай исторические данные тикера и скажи ОК",
        "",
        report,
      ),
    },
    {
      role: "assistant",
      content: "ОК",
    },
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
        description: "Направленный торговый сигнал на день.",
        enum: ["BUY", "SELL", "WAIT"],
      },
      reasoning: {
        type: "string",
        description:
          "Обоснование сигнала: какова доминирующая тема, какие противоречия есть и почему картина склоняется именно к этому решению.",
      },
    },
    required: ["signal", "reasoning"],
  },
  getOutlineHistory: async ({ resultId, history }, symbol: string, when: Date) => {
    const displayName = Reflect.get(DISPLAY_NAME_MAP, symbol) || symbol;
    const contract: AdvisorRequestContract = {
      resultId,
      date: when,
      query: displayName,
    };
    {
      await commitAssetBalanceSheet(contract, history);
      await commitAssetCashflow(contract, history);
      await commitAssetFundamentals(contract, history);
      await commitAssetIncomeStatement(contract, history);
      await commitAssetInsiderTransactions(contract, history);
      await commitAssetNews(contract, history);
      await commitGlobalNews(contract, history);
      await commitStockData(contract, history);
    }
    await history.push({
      role: "user",
      content: RESEARCH_PROMPT,
    });
  },
  validations: [
    {
      validate: ({ data }) => {
        if (!data.signal) {
          throw new Error("Поле signal не заполнено");
        }
      },
      docDescription: "Проверяет, что сигнал (BUY/SELL/WAIT) определён.",
    },
    {
      validate: ({ data }) => {
        if (!data.reasoning) {
          throw new Error("Поле reasoning не заполнено");
        }
      },
      docDescription: "Проверяет, что сигнал сгенерирован с рассуждением",
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
  ],
  callbacks: {
    async onValidDocument(result: IOutlineResult<ResearchResponseContract>) {
      if (!result.data) {
        return;
      }
      if (result.data.signal === "WAIT") {
        return;
      }
      await dumpOutlineResult(result, "./dump/outline/research");
    },
  },
});
