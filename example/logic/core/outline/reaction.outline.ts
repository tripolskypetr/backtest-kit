import {
  addOutline,
  ask,
  dumpOutlineResult,
  IOutlineHistory,
} from 'agent-swarm-kit';
import { str } from 'functools-kit';
import { OutlineName } from '../../enum/OutlineName';
import { CompletionName } from '../../enum/CompletionName';
import { AdvisorName } from '../../enum/AdvisorName';
import { StockDataRequestContract } from '../../contract/StockDataRequest.contract';
import { ForecastResponseContract } from '../../contract/ForecastResponse.contract';
import { PriceReactionResponseContract } from '../../contract/PriceReactionResponse.contract';

import dayjs from 'dayjs';

const PRICE_REACTION_PROMPT = str.newline(
  'На основе минутных свечей за последние 6 часов определи: успела ли цена отреагировать на сентимент из предыдущего сообщения?',
  '',
  '**Как думать:**',
//  ' - Не переосмысливай отчёт — возьми значение поля `sentiment` как данность и работай только с ним.', Если не заработает - убрать коммент. Тестил без этого
  ' - Сопоставь направление сентимента с фактическим движением цены на свечах.',
  ' - **bullish** (пример: ожидания снижения ставок ФРС, позитивный макрофон): ищи устойчивый рост цены. Если цена уверенно выросла на 1%+ и удерживается — priced_in. Если цена почти не двигалась вверх или продолжает флэт — not_priced_in. Если рост начался, но ещё не выдохся — pricing_in.',
  ' - **bearish** (пример: геополитика, падение после ударов США/Израиля по Ирану, риск-офф): ищи устойчивое падение. Если цена уже резко упала и стабилизировалась внизу — priced_in. Если цена ещё не реагировала — not_priced_in. Если падение в процессе — pricing_in.',
  ' - **sideways** (пример: Goldman оптимистичен, но AI-распродажа продолжается — противоречивый фон): цена должна двигаться без выраженного тренда. Если волатильность высокая без направления — priced_in. Если рынок ещё не начал хаотичное движение — not_priced_in.',
  ' - **neutral** (пример: пустой новостной фон, нет значимых событий): цена стоит на месте или флэтует. priced_in если ничего не происходит, not_priced_in если цена почему-то движется.',
  ' - Размер движения имеет значение: 0.1% — шум, 1%+ за 6 часов на минутках — реальная реакция.',
  ' - Если движение было, но цена вернулась обратно — это отработка, не реакция на сентимент.',
  '',
  '**Требуемый результат:**',
  '1. **reaction**: priced_in, not_priced_in или pricing_in.',
  '2. **reasoning**: на каких конкретных свечах или ценовых движениях основан вывод?',
);

const commitForecast = async (forecast: ForecastResponseContract, history: IOutlineHistory) => {
  await history.push(
    {
      role: 'user',
      content: str.newline(
        'Прочитай новостной сентимент по активу, запомни его и скажи ОК',
        '',
        JSON.stringify(forecast),
      ),
    },
    { role: 'assistant', content: 'ОК' },
  );
}

const commitStockData = async (resultId: string, symbol: string, when: Date, history: IOutlineHistory) => {
  const stockData = await ask<StockDataRequestContract>(
    { resultId, symbol, date: when },
    AdvisorName.StockDataAdvisor,
  );

  await history.push(
    {
      role: 'user',
      content: str.newline(
        'Прочитай минутные свечи за последние 6 часов, запомни их и скажи ОК',
        '',
        stockData,
      ),
    },
    { role: 'assistant', content: 'ОК' },
  );
}

addOutline<PriceReactionResponseContract>({
  outlineName: OutlineName.ReactionOutline,
  completion: CompletionName.OllamaOutlineToolCompletion,
  format: {
    type: 'object',
    properties: {
      price_reaction: {
        type: 'string',
        enum: ['priced_in', 'not_priced_in', 'pricing_in'],
        description: 'Успела ли цена отреагировать на сентимент.',
      },
      reasoning: {
        type: 'string',
        description: 'На каких ценовых движениях основан вывод.',
      },
    },
    required: ['price_reaction', 'reasoning'],
  },
  getOutlineHistory: async (
    { resultId, history },
    forecast: ForecastResponseContract,
    symbol: string,
    when: Date,
  ) => {
    await history.push({
      role: 'system',
      content: str.newline(
        `Текущая дата и время: ${dayjs.utc(when).format("DD MMMM YYYY HH:mm")} UTC`,
        `Актив: ${symbol}`,
      ),
    });

    await commitForecast(forecast, history);
    await commitStockData(resultId, symbol, when, history);

    await history.push({ role: 'user', content: PRICE_REACTION_PROMPT });
  },
  validations: [
    {
      validate: ({ data }) => {
        if (data.price_reaction === 'priced_in') {
          return;
        }
        if (data.price_reaction === 'not_priced_in') {
          return;
        }
        if (data.price_reaction === 'pricing_in') {
          return;
        }
        throw new Error('price_reaction должен быть priced_in, not_priced_in или pricing_in');
      },
      docDescription: 'Проверяет допустимое значение price_reaction.',
    },
    {
      validate: ({ data }) => {
        if (!data.reasoning) {
          throw new Error('reasoning не заполнен');
        }
      },
      docDescription: 'Проверяет, что вывод обоснован.',
    },
  ],
  callbacks: {
    async onValidDocument(result) {
      if (!result.data) {
        return;
      }
      await dumpOutlineResult(result, './dump/outline/reaction');
    },
  },
});
