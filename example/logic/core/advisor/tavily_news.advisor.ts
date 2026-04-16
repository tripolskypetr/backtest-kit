import { addAdvisor } from "agent-swarm-kit";
import { AdvisorName } from "../../enum/AdvisorName";
import { WebSearchRequestContract } from "../../contract/WebSearchRequest.contract";
import { fetchNews, INews } from "../../api/fetchNews";

/**
 * Market sentiment
 */
const TOPIC_QUERIES = {
  // 🔴 TIER 1 — Регуляторика (сильнейший impact сейчас)
  regulatory: [
    "SEC CLARITY Act crypto regulation ruling", // новый главный законопроект
    "GENIUS Act stablecoin legislation passed", // принят в 2025, всё ещё резонирует
    "SEC Bitcoin Ethereum ETF approval rejection",
    "SEC crypto enforcement action lawsuit",
    "Trump executive order digital assets strategic reserve",
    "White House crypto policy statement bitcoin",
  ],

  // 🔴 TIER 1 — Институционалы (новый главный драйвер цены)
  institutional: [
    "BlackRock iShares Bitcoin ETF inflows outflows",
    "MicroStrategy Strategy bitcoin purchase treasury",
    "spot Bitcoin ETF daily flows record",
    "corporate treasury bitcoin adoption announcement",
    "sovereign wealth fund bitcoin investment",
  ],

  // 🔴 TIER 1 — Макро
  macro: [
    "Federal Reserve interest rate decision bitcoin reaction",
    "CPI inflation data crypto market impact",
    "US tariffs trade war risk assets selloff", // актуально в 2025-2026
    "dollar DXY index crypto correlation",
    "US recession fears crypto market",
  ],

  // 🟡 TIER 2 — Биржи
  exchanges: [
    "Binance new listing announcement",
    "Binance delisting warning notice",
    "Coinbase listing announcement",
    "exchange hack exploit funds stolen", // Bybit $1.5B hack Feb 2025
    "Bybit hack security breach",
  ],

  // 🟡 TIER 2 — Персоны
  personas: [
    "Elon Musk bitcoin dogecoin tweet statement",
    "Michael Saylor bitcoin purchase announcement",
    "Trump bitcoin crypto statement truth social",
    "Vitalik Buterin ethereum announcement",
  ],

  // 🟡 TIER 2 — Новые нарративы (появились в 2025-2026)
  narratives: [
    "tokenized real world assets RWA crypto",
    "AI crypto agent token launch",
    "stablecoin legislation adoption bank",
    "Hyperliquid S&P 500 perpetual futures crypto", // конкретный новый нарратив
    "Meta stablecoin payments announcement",
  ],

  // 🟢 TIER 3 — On-chain / ликвидность
  onchain: [
    "Bitcoin exchange outflow accumulation whale",
    "stablecoin supply increase crypto bull signal",
    "Bitcoin long term holder accumulation",
    "crypto fear greed index extreme",
    "Bitcoin ETF AUM record high",
  ],
};

addAdvisor({
  advisorName: AdvisorName.TavilyNewsAdvisor,
  getChat: async ({ symbol }: WebSearchRequestContract) => {
    console.log(`${AdvisorName.TavilyNewsAdvisor} called symbol=${symbol}`);

    const newsMap = new Map<string, INews>();

    for (const [topic, queries] of Object.entries(TOPIC_QUERIES)) {
      for (const query of queries) {
        const newsList = await fetchNews(symbol, topic, query);
        console.log(`${AdvisorName.TavilyNewsAdvisor} fetchNews symbol=${symbol} topic=${topic} len=${newsList.length}`);
        newsList.forEach((item) => newsMap.set(item.url, item));
      }
    }

    const results = Array.from(newsMap.values()).map(
      ({ title, content, publishedDate }) => ({
        title,
        content,
        publishedDate,
      }),
    );

    return JSON.stringify(results);
  },
});
