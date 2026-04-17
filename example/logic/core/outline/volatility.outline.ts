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
import { VolatilityResponseContract } from '../../contract/VolatilityResponse.contract';

import dayjs from 'dayjs';

const VOLATILITY_PROMPT = str.newline(
  'На основе 1-минутных свечей за последние 4 часа оцени текущую волатильность рынка.',
  '',
  '**Как думать:**',
  ' - Смотри на размер тел и теней свечей: крупные тени и резкие развороты — признак высокой волатильности.',
  ' - Смотри на последовательность свечей: если цена хаотично прыгает вверх-вниз без формирования направления — рынок не видит консенсус, это high.',
  ' - **high**: цена резко бросается в обе стороны без формирования тренда, участники рынка не могут договориться о цене. Характерно для момента выхода новостей или паники.',
  ' - **normal**: умеренные колебания, есть направление или спокойный флэт с предсказуемыми движениями.',
  ' - **low**: цена почти не двигается, свечи маленькие, рынок вялый.',
  ' - Если данные недоступны (ошибка API, пустой ответ) — возвращай high.',
  '',
  '**Требуемый результат:**',
  '1. **volatility**: high, normal или low.',
  '2. **reasoning**: на каких конкретных свечах основан вывод?',
);


const commitStockData1m = async (resultId: string, symbol: string, when: Date, history: IOutlineHistory) => {
  const stockData = await ask<StockDataRequestContract>(
    { resultId, symbol, date: when },
    AdvisorName.StockData1mAdvisor,
  );

  await history.push(
    {
      role: 'user',
      content: str.newline(
        'Прочитай 1-минутные свечи за последние 4 часа, запомни их и скажи ОК',
        '',
        stockData,
      ),
    },
    { role: 'assistant', content: 'ОК' },
  );
}

addOutline<VolatilityResponseContract>({
  outlineName: OutlineName.VolatilityOutline,
  completion: CompletionName.OllamaOutlineToolCompletion,
  format: {
    type: 'object',
    properties: {
      volatility: {
        type: 'string',
        enum: ['high', 'normal', 'low'],
        description: 'Уровень волатильности рынка прямо сейчас.',
      },
      reasoning: {
        type: 'string',
        description: 'На каких конкретных свечах основан вывод.',
      },
    },
    required: ['volatility', 'reasoning'],
  },
  getOutlineHistory: async (
    { resultId, history },
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

    await commitStockData1m(resultId, symbol, when, history);

    await history.push({ role: 'user', content: VOLATILITY_PROMPT });
  },
  validations: [
    {
      validate: ({ data }) => {
        if (data.volatility === 'high') return;
        if (data.volatility === 'normal') return;
        if (data.volatility === 'low') return;
        throw new Error('volatility должен быть high, normal или low');
      },
      docDescription: 'Проверяет допустимое значение volatility.',
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
      await dumpOutlineResult(result, './dump/outline/volatility');
    },
  },
});
