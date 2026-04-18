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
import { WebSearchRequestContract } from '../../contract/WebSearchRequest.contract';
import { ForecastResponseContract } from '../../contract/ForecastResponse.contract';

import dayjs from 'dayjs';

const DISPLAY_NAME_MAP: Record<string, string> = {
  BTCUSDT: 'Bitcoin',
  ETHUSDT: 'Ethereum',
  BNBUSDT: 'Binance Coin (BNB)',
  XRPUSDT: 'Ripple',
  SOLUSDT: 'Solana',
};

const FORECAST_PROMPT = str.newline(
  'Ты — макроаналитик рынка. На основе новостного фона определи текущий рыночный сентимент по активу.',
  'Опирайся только на новости и макроэкономический контекст.',
  '',
  '**Как думать:**',
  ' - Читай новости как сигналы настроения участников рынка: что пугает, что вдохновляет, что вызывает неопределённость.',
  ' - Крупные события (регуляторные решения, макростатистика, геополитика) имеют больший вес, чем мелкий информационный шум.',
  ' - Противоречивые новости не отменяют друг друга — найди доминирующую силу.',
  ' - Если поток новостей слаб, разнонаправлен или отсутствует — это тоже информация.',
  '',
  '**Сентимент (выбери ровно один):**',
  ' - **bullish**: новостной фон преимущественно позитивен, участники рынка настроены на рост.',
  ' - **bearish**: новостной фон преимущественно негативен, участники рынка ожидают падения.',
  ' - **neutral**: новостной фон сбалансирован или отсутствует, выраженного давления нет.',
  ' - **sideways**: новости противоречат друг другу, рынок в состоянии неопределённости без чёткого направления.',
  '',
  '**Уверенность (confidence):**',
  ' - **reliable**: новостной фон однозначен, доминирующая сила выражена чётко.',
  ' - **not_reliable**: новости противоречивы, слабые или отсутствуют — сентимент определён с трудом.',
  '',
  '**Требуемый результат:**',
  '1. **sentiment**: bullish, bearish, neutral или sideways.',
  '2. **confidence**: reliable или not_reliable.',
  '3. **reasoning**: какие новости определили этот сентимент? Почему именно это значение?',
);

const commitGlobalNews = async (
  contract: WebSearchRequestContract,
  history: IOutlineHistory,
) => {
  const report = await ask<WebSearchRequestContract>(contract, AdvisorName.TavilyNewsAdvisor);
  await history.push(
    {
      role: 'user',
      content: str.newline(
        'Прочитай глобальные макроэкономические новости за последние 24 часа, запомни их и скажи ОК',
        '',
        report,
      ),
    },
    { role: 'assistant', content: 'ОK' },
  );
};

addOutline<ForecastResponseContract>({
  outlineName: OutlineName.ForecastOutline,
  completion: CompletionName.OllamaOutlineToolCompletion,
  format: {
    type: 'object',
    properties: {
      sentiment: {
        type: 'string',
        enum: ['bullish', 'bearish', 'neutral', 'sideways'],
        description: 'Рыночный сентимент на основе новостного фона.',
      },
      confidence: {
        type: 'string',
        enum: ['reliable', 'not_reliable'],
        description: 'Уверенность в сентименте: reliable — фон однозначен, not_reliable — новости противоречивы, слабые или отсутствуют.',
      },
      reasoning: {
        type: 'string',
        description: 'Какие новости определили этот сентимент.',
      },
    },
    required: ['sentiment', 'confidence', 'reasoning'],
  },
  getOutlineHistory: async (
    { resultId, history },
    symbol: string,
    when: Date,
  ) => {
    const displayName = DISPLAY_NAME_MAP[symbol] ?? symbol;

    await history.push({
      role: 'system',
      content: str.newline(
        `Текущая дата и время: ${dayjs.utc(when).format("DD MMMM YYYY HH:mm")} UTC`,
        `Актив: ${displayName} (${symbol})`,
      ),
    });

    await commitGlobalNews(
      {
        resultId,
        symbol,
      },
      history,
    );

    await history.push({ role: 'user', content: FORECAST_PROMPT });
  },
  validations: [
    {
      validate: ({ data }) => {
        if (data.sentiment === 'bullish') {
          return;
        }
        if (data.sentiment === 'bearish') {
          return;
        }
        if (data.sentiment === 'neutral') {
          return;
        }
        if (data.sentiment === 'sideways') {
          return;
        }
        throw new Error('sentiment должен быть bullish, bearish, neutral или sideways');
      },
      docDescription: 'Проверяет допустимое значение sentiment.',
    },
    {
      validate: ({ data }) => {
        if (data.confidence === 'reliable') return;
        if (data.confidence === 'not_reliable') return;
        throw new Error('confidence должен быть reliable или not_reliable');
      },
      docDescription: 'Проверяет допустимое значение confidence.',
    },
    {
      validate: ({ data }) => {
        if (!data.reasoning) {
          throw new Error('reasoning не заполнен');
        }
      },
      docDescription: 'Проверяет, что решение обосновано.',
    },
  ],
  callbacks: {
    async onValidDocument(result) {
      if (!result.data) {
        return;
      }
      await dumpOutlineResult(result, './dump/outline/forecast');
    },
  },
});
