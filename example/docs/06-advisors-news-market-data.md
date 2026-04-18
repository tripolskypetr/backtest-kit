---
title: begin/06_advisors_news_market_data
group: begin
---

# Advisors: News & Market Data

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [logic/contract/StockDataRequest.contract.ts](logic/contract/StockDataRequest.contract.ts)
- [logic/contract/WebSearchRequest.contract.ts](logic/contract/WebSearchRequest.contract.ts)
- [logic/core/advisor/stock_data_15m.advisor.ts](logic/core/advisor/stock_data_15m.advisor.ts)
- [logic/core/advisor/stock_data_1m.advisor.ts](logic/core/advisor/stock_data_1m.advisor.ts)
- [logic/core/advisor/tavily_news.advisor.ts](logic/core/advisor/tavily_news.advisor.ts)
- [logic/enum/AdvisorName.ts](logic/enum/AdvisorName.ts)

</details>



The news-sentiment-ai-trader utilizes a set of **Advisors** to provide the LLM with the necessary context to generate market forecasts. These advisors are registered via the `agent-swarm-kit` and act as specialized data retrieval tools. They transform raw data from external APIs and internal market state into structured Markdown or JSON formats optimized for LLM consumption.

The system implements three primary advisors defined in `logic/enum/AdvisorName.ts` [logic/enum/AdvisorName.ts:1-7]():
1.  **TavilyNewsAdvisor**: Retrieves filtered news and sentiment data.
2.  **StockData1mAdvisor**: Provides high-resolution 1-minute price action.
3.  **StockData15mAdvisor**: Provides medium-resolution 15-minute price action for trend analysis.

### Advisor Architecture & Data Flow

The advisors bridge the gap between the "Code Entity Space" (API calls, data processing) and the "Natural Language Space" (Markdown tables, JSON summaries).

**System Entity Mapping**
Title: Advisor Component Mapping
![Mermaid Diagram](./diagrams/06-advisors-news-market-data_0.svg)
**Sources:** [logic/core/advisor/tavily_news.advisor.ts:15-40](), [logic/core/advisor/stock_data_1m.advisor.ts:9-41](), [logic/core/advisor/stock_data_15m.advisor.ts:9-41]()

---

### TavilyNewsAdvisor

The `TavilyNewsAdvisor` is responsible for gathering qualitative data regarding market sentiment. It uses the `WebSearchRequestContract` [logic/contract/WebSearchRequest.contract.ts:1-4]() which requires a `symbol` and a `resultId`.

#### Implementation Details
- **Search Logic**: It iterates through predefined `TOPIC_QUERIES` [logic/core/advisor/tavily_news.advisor.ts:9-13](). Currently, it focuses on "sentiment" with queries targeting Bitcoin market sentiment (bullish, bearish, neutral, or sideways) [logic/core/advisor/tavily_news.advisor.ts:10-12]().
- **Deduplication**: Uses a `Map` keyed by URL to ensure that if multiple queries return the same article, it is only included once in the final output [logic/core/advisor/tavily_news.advisor.ts:20-28]().
- **Output**: Returns a JSON string containing an array of objects with `title`, `content`, and `publishedDate` [logic/core/advisor/tavily_news.advisor.ts:30-38]().

**Sources:** [logic/core/advisor/tavily_news.advisor.ts:1-41](), [logic/contract/WebSearchRequest.contract.ts:1-7]()

---

### Market Data Advisors

The market data advisors provide quantitative context. They share a similar implementation pattern but differ in their lookback windows and timeframes. Both utilize the `StockDataRequestContract` [logic/contract/StockDataRequest.contract.ts:1-6]().

#### Data Resolution Comparison
| Advisor | Timeframe | Limit (Candles) | Total Duration |
| :--- | :--- | :--- | :--- |
| `StockData1mAdvisor` | 1m | 240 | 4 Hours |
| `StockData15mAdvisor` | 15m | 32 | 8 Hours |

#### StockData1mAdvisor
Registered as `stock_data_1m_advisor` [logic/enum/AdvisorName.ts:4](), this component fetches 240 candles of 1-minute data using the `getCandles` utility from `backtest-kit` [logic/core/advisor/stock_data_1m.advisor.ts:14](). It calculates several technical metrics for each candle to assist the LLM in understanding volatility and price action:
- **Volatility %**: `((high - low) / close) * 100` [logic/core/advisor/stock_data_1m.advisor.ts:23]().
- **Body %**: The size of the candle body relative to its total range [logic/core/advisor/stock_data_1m.advisor.ts:24-26]().
- **Change %**: The percentage difference between Open and Close [logic/core/advisor/stock_data_1m.advisor.ts:27]().

#### StockData15mAdvisor
Registered as `stock_data_15m_advisor` [logic/enum/AdvisorName.ts:3](), this component fetches 32 candles of 15-minute data [logic/core/advisor/stock_data_15m.advisor.ts:7-14](). It uses the same formatting logic as the 1m advisor but provides a broader view of the market trend.

#### Markdown Formatting
Both advisors format their data into a Markdown table for the LLM. The table includes:
- **Time**: Formatted as `YYYY-MM-DD HH:mm UTC` using `dayjs` [logic/core/advisor/stock_data_1m.advisor.ts:28]().
- **Price/Volume**: Formatted using `formatPrice` and `formatQuantity` to ensure correct decimal precision for the specific symbol [logic/core/advisor/stock_data_1m.advisor.ts:30-34]().

**Sources:** [logic/core/advisor/stock_data_1m.advisor.ts:1-41](), [logic/core/advisor/stock_data_15m.advisor.ts:1-41](), [logic/contract/StockDataRequest.contract.ts:1-8]()

---

### Implementation Sequence

The following diagram illustrates how the `agent-swarm-kit` interacts with an advisor (e.g., `StockData1mAdvisor`) to produce data for the LLM.

Title: Advisor Execution Flow
![Mermaid Diagram](./diagrams/06-advisors-news-market-data_1.svg)
**Sources:** [logic/core/advisor/stock_data_1m.advisor.ts:9-41](), [logic/enum/AdvisorName.ts:1-7]()