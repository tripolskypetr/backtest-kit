import dayjs from "dayjs";
import { getTavily } from "../config/tavily";
import { getDate, Cache, getMode, alignToInterval } from "backtest-kit";
import slugify from "slugify";

interface INews {
    url: string;
    title: string;
    content: string;
    publishedDate: string;
}

const SCORE_THRESHOLD = 0.68;
const NEWS_WINDOW_HOURS = 4;

const TAVILY_DOMAINS = [
  // Крипто-СМИ — без изменений, все живы
  "coindesk.com",
  "cointelegraph.com",
  "theblock.co",
  "decrypt.co",
  "blockworks.co",        // 👈 добавить — вырос в tier-2 по влиянию

  // Финансовые СМИ
  "reuters.com",
  "bloomberg.com",
  "wsj.com",

  // Регуляторы
  "sec.gov",
  "federalreserve.gov",
  "whitehouse.gov",

  // Биржи — анонсы
  "binance.com",
  "coinbase.com",
  "bybit.com",            // остаётся, несмотря на hack — крупнейшая по объёму
  "okx.com",
  "kraken.com",
  "hyperliquid.xyz",      // 👈 добавить — tier-1 по on-chain деривативам сейчас

  // Институционалы — новый важный tier
  "blackrock.com",        // 👈 ETF flows, официальные заявления
  "grayscale.com",        // 👈 GBTC/ETHE отчёты двигают рынок
  "microstrategy.com",    // 👈 Сэйлор анонсирует покупки здесь первым

  // Персоны
  "truthsocial.com",
  "stocktwits.com",
];

/**
 * Fetches financial news from Tavily API for the given date range.
 * Results are filtered by relevance score (> 0.68).
 */
const search = async (query: string, from: Date, to: Date) => {
  console.log(`fetchNews search query=${query} from=${from} to=${to}`);
  const tavily = getTavily();
  const { answer, ...search } = await tavily.search(query, {
    includeAnswer: false,
    topic: "news",
    maxResults: 5,
    max_tokens: 25000,
    searchDepth: "advanced",
    include_domains: TAVILY_DOMAINS,
    startDate: dayjs(from).format("YYYY-MM-DD"),
    endDate: dayjs(to).format("YYYY-MM-DD"),
  });
  if (!search.results.length) {
    console.warn(`fetchNews search missing results query=${query} from=${from} to=${to}`)
    return [];
  }
  return search.results
    .filter(({ score }) => {
        if (score < SCORE_THRESHOLD) {
            console.warn(`fetchNews search score too low query=${query} from=${from} to=${to}`)
            return false;
        }
        return true;
    })
    .filter(({ publishedDate }) => {
        if (!publishedDate) {
            console.warn(`fetchNews search missing publishedDate query=${query} from=${from} to=${to}`)
            return false;
        }
        const hour = dayjs(publishedDate).utc().get("hour");
        const minute = dayjs(publishedDate).utc().get("minute");
        if (hour === 0 && minute === 0) {
            console.warn(`fetchNews search invalid publishedDate query=${query} from=${from} to=${to}`)
            return false;
        }
        return true;
    });
};

/**
 * Backtest variant. Wrapped in Cache.file with interval "1d", so Tavily is called once
 * per daily candle open regardless of how many 1m candles fire within that day.
 * Fetches all news for the full day; the caller (fetchNews) then narrows to the
 * NEWS_WINDOW_HOURS slice around the current backtest timestamp.
 */
const fetchNewsInBacktest = Cache.file(async (symbol: string, topic: string, query: string, when: Date): Promise<INews[]> => {
    console.log(`fetchNewsInBacktest symbol=${symbol} topic=${topic} when=${when} query=${query}`);

    const dateFrom = alignToInterval(when, "1d");
    const dateTo = dayjs(when).add(1, 'day').toDate();

    const newsList = await search(
        query,
        dateFrom,
        dateTo,
    );

    return newsList;
}, {
    interval: "1d",
    key: ([symbol, topic, alignMs, query]) => `${symbol}_${topic}_${alignMs}_${slugify(query)}`,
    name: "news-backtest",
});

/**
 * Live variant. Fetches news for the last NEWS_WINDOW_HOURS hours on every call.
 * No caching — always reflects the current market moment.
 */
const fetchNewsInLive = async (symbol: string, topic: string, query: string, when: Date): Promise<INews[]> => {
    console.log(`fetchNewsInBacktest symbol=${symbol} topic=${topic} when=${when} query=${query}`);

    const dateFrom = dayjs(when).subtract(NEWS_WINDOW_HOURS, 'hour').toDate();
    const dateTo = dayjs(when).toDate();

    const newsList = await search(
        query,
        dateFrom,
        dateTo,
    )

    return newsList;
}

/**
 * Public entry point. Dispatches to the live or backtest variant based on the
 * current mode, then filters results to the NEWS_WINDOW_HOURS window ending at
 * the current timestamp. This ensures no future news leaks into backtest signals.
 */
const fetchNews = async (symbol: string, topic: string, query: string) => {
    console.log(`fetchNews symbol=${symbol} topic=${topic} query=${query}`);
    
    const mode = await getMode();
    const when = await getDate();

    const dateFrom = dayjs(when).subtract(NEWS_WINDOW_HOURS, 'hour').toDate();
    const dateTo = dayjs(when).toDate();
    
    let newsList: INews[] = [];

    if (mode === "live") {
        newsList = await fetchNewsInLive(symbol, topic, query, when);
    }

    if (mode === "backtest") {
        newsList = await fetchNewsInBacktest(symbol, topic, query, when);
    }
    
    return newsList
        .filter(({ publishedDate }) => !!publishedDate)
        .filter(({ publishedDate }) => {
            let isOk = true;
            isOk = isOk && dayjs(publishedDate).isBefore(dateTo);
            isOk = isOk && dayjs(publishedDate).isAfter(dateFrom);
            return isOk;
        });
};

export { fetchNews, type INews };
