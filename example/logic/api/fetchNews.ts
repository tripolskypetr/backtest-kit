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

/**
 * Fetches financial news from Tavily API for the given date range.
 * Results are filtered by relevance score (> 0.68).
 */
const search = async (query: string, from: Date, to: Date) => {
  const tavily = getTavily();
  const { answer, ...search } = await tavily.search(query, {
    includeAnswer: false,
    topic: "finance",
    maxResults: 10,
    max_tokens: 25000,
    searchDepth: "advanced",
    startDate: dayjs(from).format("YYYY-MM-DD"),
    endDate: dayjs(to).format("YYYY-MM-DD"),
  });
  return search.results
    .filter(({ score }) => score > SCORE_THRESHOLD)
    .map(({ title, url, content, publishedDate }) => ({
      url,
      title,
      content,
      publishedDate,
    }));
};

/**
 * Backtest variant. Wrapped in Cache.file with interval "1d", so Tavily is called once
 * per daily candle open regardless of how many 1m candles fire within that day.
 * Fetches all news for the full day; the caller (fetchNews) then narrows to the
 * NEWS_WINDOW_HOURS slice around the current backtest timestamp.
 */
const fetchNewsInBacktest = Cache.file(async (symbol: string, query: string, when: Date): Promise<INews[]> => {
    console.log(`fetchNewsInBacktest symbol=${symbol} when=${when} query=${query}`);

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
    key: ([symbol, alignMs, query]) => `${symbol}_${alignMs}_${slugify(query)}`,
    name: "news-backtest",
});

/**
 * Live variant. Fetches news for the last NEWS_WINDOW_HOURS hours on every call.
 * No caching — always reflects the current market moment.
 */
const fetchNewsInLive = async (symbol: string, query: string, when: Date): Promise<INews[]> => {
    console.log(`fetchNewsInBacktest symbol=${symbol} when=${when} query=${query}`);

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
const fetchNews = async (symbol: string, query: string) => {
    const mode = await getMode();
    const when = await getDate();

    const dateFrom = dayjs(when).subtract(NEWS_WINDOW_HOURS, 'hour').toDate();
    const dateTo = dayjs(when).toDate();
    
    let newsList: INews[] = [];

    if (mode === "live") {
        newsList = await fetchNewsInLive(symbol, query, when);
    }

    if (mode === "backtest") {
        newsList = await fetchNewsInBacktest(symbol, query, when);
    }
    
    return newsList
        .filter(({ publishedDate}) => !!publishedDate)
        .filter(({ publishedDate }) => {
            let isOk = true;
            isOk = isOk && dayjs(publishedDate).isBefore(dateTo);
            isOk = isOk && dayjs(publishedDate).isAfter(dateFrom);
            return isOk;
        });
};

export { fetchNews };
