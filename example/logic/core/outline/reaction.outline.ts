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
import { ReactionResponseContract } from '../../contract/ReactionResponse.contract';

import dayjs from 'dayjs';

const PRICE_REACTION_PROMPT = str.newline(
  'На основе 15-минутных свечей за последние 24 часа определи: успела ли цена отреагировать на сентимент из предыдущего сообщения?',
  '',
  '**Как думать:**',
  ' - Оценивай весь 24-часовой период целиком, а не только его конец.',
  ' - **bullish**: за 24 часа ищи устойчивый рост. Если рост состоялся — priced_in. Если цена не двигалась вверх — not_priced_in. Если рост продолжается прямо сейчас — pricing_in.',
  ' - **bearish**: за 24 часа ищи устойчивое падение. Если падение состоялось — priced_in, даже если в конце периода идёт отскок вверх. Если цена не падала — not_priced_in. Если падение продолжается прямо сейчас — pricing_in.',
  ' - **sideways**: ищи отсутствие направленного движения. Если рынок флэтует — priced_in. Если направление ещё не определилось — not_priced_in.',
  ' - **neutral**: цена не реагирует ни в какую сторону. priced_in если рынок спокоен, not_priced_in если цена неожиданно движется.',
  ' - Если движение было, но цена полностью вернулась обратно — это не реакция на сентимент. Исключение: V-образный отскок (резкое падение с немедленным восстановлением) — это priced_in, рынок отработал сентимент и нашёл покупателей/продавцов.',
  ' - Критерий **priced_in**: цена достигла ближайшего уровня поддержки (для bearish) или сопротивления (для bullish) и остановилась или консолидируется у него.',
  ' - Если данные свечей недоступны (ошибка API, пустой ответ) — возвращай priced_in и confidence: not_reliable.',
  '',
  '**Оценка уверенности (confidence):**',
  ' - **reliable**: картина на 15-минутках однозначная, тренд выражен.',
  ' - **not_reliable**: картина неоднозначная — цена хаотично движется в обе стороны без формирования направления, или данные недоступны.',
  '',
  '**Торговое решение (trade_action):**',
  ' - Учитывая сентимент, реакцию цены и текущую картину на свечах — стоит ли сейчас входить в сделку в направлении сентимента?',
  ' - **enter**: да, условия благоприятны.',
  ' - **wait**: нет, лучше подождать.',
  '',
  '**Требуемый результат:**',
  '1. **price_reaction**: priced_in, not_priced_in или pricing_in.',
  '2. **confidence**: reliable или not_reliable.',
  '3. **trade_action**: enter или wait.',
  '4. **reasoning**: на каких конкретных свечах или ценовых движениях основан вывод?',
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

const commitStockData15m = async (resultId: string, symbol: string, when: Date, history: IOutlineHistory) => {
  const stockData = await ask<StockDataRequestContract>(
    { resultId, symbol, date: when },
    AdvisorName.StockData15mAdvisor,
  );

  await history.push(
    {
      role: 'user',
      content: str.newline(
        'Прочитай 15-минутные свечи за последние 24 часа (общая картина), запомни их и скажи ОК',
        '',
        stockData,
      ),
    },
    { role: 'assistant', content: 'ОК' },
  );
}


addOutline<ReactionResponseContract>({
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
      confidence: {
        type: 'string',
        enum: ['reliable', 'not_reliable'],
        description: 'Уверенность в оценке: reliable — картина однозначная, not_reliable — сильный шторм, недоступные данные или неопределённость.',
      },
      trade_action: {
        type: 'string',
        enum: ['enter', 'wait'],
        description: 'enter — сентимент не отработан, входить имеет смысл. wait — движение уже состоялось, входить поздно.',
      },
      reasoning: {
        type: 'string',
        description: 'На каких ценовых движениях основан вывод.',
      },
    },
    required: ['price_reaction', 'confidence', 'trade_action', 'reasoning'],
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
    await commitStockData15m(resultId, symbol, when, history);

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
        if (data.confidence === 'reliable') {
          return;
        }
        if (data.confidence === 'not_reliable') {
          return;
        }
        throw new Error('confidence должен быть reliable или not_reliable');
      },
      docDescription: 'Проверяет допустимое значение confidence.',
    },
    {
      validate: ({ data }) => {
        if (data.trade_action === 'enter') {
          return;
        }
        if (data.trade_action === 'wait') {
          return;
        }
        throw new Error('trade_action должен быть enter или wait');
      },
      docDescription: 'Проверяет допустимое значение trade_action.',
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
