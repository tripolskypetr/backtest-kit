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

const PRICE_REACTION_PROMPT = (sentiment: string) => str.newline(
  `Сентимент по активу определён как **${sentiment}**.`,
  '',
  'На основе минутных свечей за последние 6 часов определи: успела ли цена отреагировать на этот сентимент?',
  '',
  '**Как думать:**',
  ' - Смотри на движение цены за последние 24 часа в целом, но анализируй конкретные свечи из таблицы.',
  ' - Для **bullish**: ожидается рост цены. Если цена уже значительно выросла — сентимент priced_in. Если цена ещё не двигалась вверх — not_priced_in. Если рост начался но не завершён — pricing_in.',
  ' - Для **bearish**: ожидается падение цены. Если цена уже значительно упала — priced_in. Если ещё не падала — not_priced_in. Если падение началось но не завершено — pricing_in.',
  ' - Для **neutral/sideways**: смотри на отсутствие направленного движения.',
  '',
  '**Требуемый результат:**',
  '1. **reaction**: priced_in, not_priced_in или pricing_in.',
  '2. **reasoning**: на каких свечах или ценовых движениях основан вывод?',
);

addOutline<PriceReactionResponseContract>({
  outlineName: OutlineName.PriceReactionOutline,
  completion: CompletionName.OllamaOutlineToolCompletion,
  format: {
    type: 'object',
    properties: {
      reaction: {
        type: 'string',
        enum: ['priced_in', 'not_priced_in', 'pricing_in'],
        description: 'Успела ли цена отреагировать на сентимент.',
      },
      reasoning: {
        type: 'string',
        description: 'На каких ценовых движениях основан вывод.',
      },
    },
    required: ['reaction', 'reasoning'],
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
        `Новостной сентимент: ${forecast.sentiment}`,
        `Обоснование сентимента: ${forecast.reasoning}`,
      ),
    });

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

    await history.push({ role: 'user', content: PRICE_REACTION_PROMPT(forecast.sentiment) });
  },
  validations: [
    {
      validate: ({ data }) => {
        if (data.reaction === 'priced_in') return;
        if (data.reaction === 'not_priced_in') return;
        if (data.reaction === 'pricing_in') return;
        throw new Error('reaction должен быть priced_in, not_priced_in или pricing_in');
      },
      docDescription: 'Проверяет допустимое значение reaction.',
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
      await dumpOutlineResult(result, './dump/outline/price_reaction');
    },
  },
});
