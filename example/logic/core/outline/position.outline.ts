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
import { ResearchResponseContract } from "../../contract/ResearchResponse.contract";
import dayjs from "dayjs";
import { PositionResponseContract } from "../../contract/PositionResponse.contract";
import { formatPrice, formatQuantity, getCandles } from "backtest-kit";

const RECENT_CANDLES = 60 * 4;

const DISPLAY_NAME_MAP = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  BNBUSDT: "Binance Coin (BNB)",
  XRPUSDT: "Ripple",
  SOLUSDT: "Solana",
};

const LONG_POSITION_PROMPT = str.newline(
  "Ты — трейдер. Фундаментальный анализ дал сигнал LONG. Твоя задача — решить: входить в лонг прямо сейчас или ждать.",
  "",
  "**Выполни по шагам:**",
  "",
  "Шаг 1. Найди локальный минимум за последние свечи — самую низкую цену Low среди последних 30–60 свечей.",
  "Шаг 2. Найди локальный максимум за те же свечи — самую высокую цену High.",
  "Шаг 3. Вычисли расстояние от текущей цены Close последней свечи до локального максимума в процентах:",
  "  distance_to_high = (local_high - current_price) / current_price * 100",
  "Шаг 4. Оцени импульс: последние 5–10 свечей в основном растущие (Close > Open) — импульс однозначный вверх?",
  "  Если свечи вперемешку без явного направления — импульс неоднозначный.",
  "",
  "**Условия для OPEN:**",
  " - distance_to_high >= 1.5% — есть достаточно хода чтобы взять TP",
  " - Импульс однозначный вверх: большинство последних свечей растущие, нет резких разворотов",
  " - Цена не находится вблизи локального максимума (не перекуплена прямо сейчас)",
  "",
  "**Условия для WAIT:**",
  " - distance_to_high < 1.5% — до локального максимума слишком мало хода",
  " - Импульс смешанный или нисходящий — нет уверенного движения вверх",
  " - Цена только что сделала резкий скачок вверх — лучше дождаться отката",
  "",
  "**Требуемый результат:**",
  "1. **action**: OPEN или WAIT.",
  "2. **reasoning**: укажи local_min, local_high, current_price, distance_to_high и вывод об импульсе.",
);

const SHORT_POSITION_PROMPT = str.newline(
  "Ты — трейдер. Фундаментальный анализ дал сигнал SHORT. Твоя задача — решить: входить в шорт прямо сейчас или ждать.",
  "",
  "**Выполни по шагам:**",
  "",
  "Шаг 1. Найди локальный максимум за последние свечи — самую высокую цену High среди последних 30–60 свечей.",
  "Шаг 2. Найди локальный минимум за те же свечи — самую низкую цену Low.",
  "Шаг 3. Вычисли расстояние от текущей цены Close последней свечи до локального минимума в процентах:",
  "  distance_to_low = (current_price - local_low) / current_price * 100",
  "Шаг 4. Оцени импульс: последние 5–10 свечей в основном падающие (Close < Open) — импульс однозначный вниз?",
  "  Если свечи вперемешку без явного направления — импульс неоднозначный.",
  "",
  "**Условия для OPEN:**",
  " - distance_to_low >= 1.5% — есть достаточно хода чтобы взять TP",
  " - Импульс однозначный вниз: большинство последних свечей падающие, нет резких разворотов",
  " - Цена не находится вблизи локального минимума (не перепродана прямо сейчас)",
  "",
  "**Условия для WAIT:**",
  " - distance_to_low < 1.5% — до локального минимума слишком мало хода",
  " - Импульс смешанный или восходящий — нет уверенного движения вниз",
  " - Цена только что сделала резкий обвал — лучше дождаться отскока",
  "",
  "**Требуемый результат:**",
  "1. **action**: OPEN или WAIT.",
  "2. **reasoning**: укажи local_high, local_low, current_price, distance_to_low и вывод об импульсе.",
);

const commitTickerHistory = async (
  symbol: string,
  history: IOutlineHistory,
) => {

 let markdown = "";

 const candles = await getCandles(symbol, "1m", RECENT_CANDLES);

  markdown += `## One-Minute Candles History (Last ${RECENT_CANDLES})\n`;
  markdown += `> Current trading pair: ${String(symbol).toUpperCase()}\n\n`;

  // Заголовок таблицы
  markdown += `| # | Time | Open | High | Low | Close | Volume | Price Change % | Volatility % | Body % |\n`;
  markdown += `|---|------|------|------|-----|-------|--------|----------------|--------------|--------|\n`;

  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index];

    const volatilityPercent = ((candle.high - candle.low) / candle.close) * 100;
    const bodySize = Math.abs(candle.close - candle.open);
    const candleRange = candle.high - candle.low;
    const bodyPercent = candleRange > 0 ? (bodySize / candleRange) * 100 : 0;
    const priceChangePercent = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0;

    const formattedTime = new Date(candle.timestamp).toISOString();

    const open = await formatPrice(symbol, candle.open);
    const high = await formatPrice(symbol, candle.high);
    const low = await formatPrice(symbol, candle.low);
    const close = await formatPrice(symbol, candle.close);
    const volume = formatQuantity(symbol, candle.volume);

    markdown += `| ${index + 1} | ${formattedTime} | ${open} | ${high} | ${low} | ${close} | ${volume} | ${priceChangePercent.toFixed(3)}% | ${volatilityPercent.toFixed(2)}% | ${bodyPercent.toFixed(1)}% |\n`;
  }

  await history.push(
    {
      role: "user",
      content: str.newline(
        "Прочитай историю минутных свечей и скажи ОК",
        "",
        markdown,
      ),
    },
    {
      role: "assistant",
      content: "ОК",
    }
  );
}

const commitFundamentalResearch = async (
  research: ResearchResponseContract,
  history: IOutlineHistory,
) => {
  await history.push(
    {
      role: "user",
      content: str.newline(
        "Прочитай фундаментальный анализ рынка от профессионального трейдера и скажи ОК",
        "",
        JSON.stringify(research, null, 2),
      ),
    },
    {
      role: "assistant",
      content: "ОК",
    },
  );
};

addOutline<PositionResponseContract>({
  outlineName: OutlineName.PositionOutline,
  completion: CompletionName.OllamaOutlineToolCompletion,
  format: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Решение о входе: OPEN — войти сейчас, WAIT — ждать лучшей точки.",
        enum: ["OPEN", "WAIT"],
      },
      reasoning: {
        type: "string",
        description: "Обоснование решения о входе на основе технического анализа.",
      },
    },
    required: ["action", "reasoning"],
  },
  getOutlineHistory: async (
    { history },
    research: ResearchResponseContract,
    symbol: string,
    when: Date,
  ) => {
    const displayName = Reflect.get(DISPLAY_NAME_MAP, symbol) || symbol;
    await history.push({
      role: "system",
      content: str.newline(
        `Текущая дата и время: ${dayjs(when).format("DD MMMM YYYY HH:mm")}`,
        `Выбранный актив: ${displayName}`,
      ),
    });
    {
      await commitFundamentalResearch(research, history);
      await commitTickerHistory(symbol, history);
    }
    if (research.signal === "BUY") {
      await history.push({
        role: "user",
        content: LONG_POSITION_PROMPT,
      });
      return;
    }
    if (research.signal === "SELL") {
      await history.push({
        role: "user",
        content: SHORT_POSITION_PROMPT,
      });
      return;
    }
    throw new Error("Unsupported signal");
  },
  validations: [
    {
      validate: ({ data }) => {
        if (!data.action) {
          throw new Error("Поле action не заполнено");
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
        if (data.action === "OPEN") {
          return;
        }
        if (data.action === "WAIT") {
          return;
        }
        throw new Error("Поле action должно быть OPEN или WAIT");
      },
      docDescription: "Проверяет, что action содержит допустимое значение.",
    },
  ],
  callbacks: {
    async onValidDocument(result: IOutlineResult<PositionResponseContract>) {
      if (!result.data) {
        return;
      }
      if (result.data.action === "WAIT") {
        return;
      }
      await dumpOutlineResult(result, "./dump/outline/position");
    },
  },
});
