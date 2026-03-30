## Guide

### How to Write a Strategy

**What NOT to do**

- Don't read all project files and bloat the context.

   Strategies are written as simple `.pine` files; the command to run them is below.

- Don't brute-force iterate.

   The worst thing you can do is start incrementally writing into an existing project file. That's not how this works — you need market analysis, not work for the sake of work.

- Don't sacrifice efficiency for universality.

   Markets change. By building a universal solution you lose the optimization that is the competitive edge actually generating profit at any given moment.

- Don't write `.pine` files with side effects.

   You don't need `var` and `na` in PineScript — compute all values on every iteration. This makes errors and unpredictable behavior more likely to surface before going to production. Keep the code easy to understand; avoid premature optimization.

- Don't use hacks in trading strategy code.

   You cannot disguise the absence of an SL by using ATR when the exit keeps shifting relative to the close price on every iteration. Trailing criteria must be finite — you cannot keep shifting the stop loss forever hoping for a bounce or a drop. Avoid HOLD in any form.

- Don't build strategies that produce one signal every few days.

   Three profitable signals is not a successful trading strategy — it's luck. To evaluate a strategy statistically you need at least one signal per day.

**What TO do**

- Every strategy is written for a single calendar month.

   Follow the naming pattern or refuse to work. The money is in optimizing for current market conditions; a backtest spanning two or more months is mathematically meaningless because the final balance will wipe out profit through commission whipsaw.

   * `./math/jan_2026.pine`, `./content/jan_2026.strategy.ts`
   * `./math/feb_2026.pine`, `./content/feb_2026.strategy.ts`
   * `./math/march_2026.pine`, `./content/march_2026.strategy.ts`
   * `./math/apr_2026.pine`, `./content/apr_2026.strategy.ts`
   * `./math/may_2026.pine`, `./content/may_2026.strategy.ts`

- Read the news background for the chosen time period.

   The focus should ALWAYS be on negative news. Searching for the Bitcoin price gives you marketing trash. Searching for analytics gives you SEO garbage. Use queries like:

   * Bitcoin negative news March 2026 price drop regulatory problems…
   * bitcoin price February 5 2024 current level forecast analytics BTC
   * bitcoin negative news February 2024 problems regulator crackdown bitcoin
   * bitcoin negative news March 2026 regulatory problems bans
   * bitcoin security hackers fraud regulation negative news problems

- Create a `--dump` to output candles.

   You need to see where the money actually is in the market. Identify the general trend: if it's bearish, protect against LONGs; if it's bullish, protect against SHORTs. There may be a short-term bounce or panic driven by geopolitical news.

- The market may be ranging (sideways).

   There are cases when no position should be opened at all — your analysis must account for this.

- TP/SL should be dynamic, but not scalping.

   The exchange charges 0.2% to enter and 0.2% to exit. You may think the strategy is profitable, but it's whipsaw. Minimum TP: 1%.

- Don't try to build an all-weather strategy.

   I need to understand where the money is in the market only within the specified time period. If the strategy stops being profitable I'll simply ask you to run the analysis again.

- Don't build HOLD strategies.

   I need to find where the money actually is in the market, not sit in a position hoping for luck. The criterion for "where the money is" must be expressed as a formula that finds effective entry points that lead to profit directly.

- Don't brut force strategies.

    Use fresh strategies with different concepts. Do not edit existing strategy one cause this will give you a loop even if you coded it. I need concept engineering

### Market Candle Dump

File `BTCUSDT_500_15m_1772236800000.jsonl` will be created at `./dump/BTCUSDT_500_15m_1772236800000.jsonl`

```
npm start -- --dump --timeframe 15m --limit 500 --when "2026-02-28T00:00:00.000Z" --jsonl
```

### Running `.pine` Files

File `impulse_trend_15m.jsonl` will be created at `./math/dump/impulse_trend_15m.jsonl`

```
npm start --  --pine ./math/impulse_trend_15m.pine --timeframe 15m --limit 500 --when "2026-02-28T00:00:00.000Z" --jsonl
```

### Algorithm

**Planning the Work**

1. Read the `.pine` file from the previous month if one exists.

2. Read news from the internet for the current month with a focus on negative news.

3. Correlate the news background with the candle dump. News sources must visibly influence the candle data for the chosen time period: price bounce, sideways range, neutral trend, decline, or rally.

4. Understand why the previous month's file stopped working by interpreting its logic in the context of the new news background.

5. In addition to news, review the candle dump independently: assess volatility, market gaps, trading volumes, and risks.

**Writing the Strategy**

1. Create NEW files for the current month and write them from scratch. Do not copy-paste and do not attempt to brute-force parameters. New month — new strategy.

2. Run the `.pine` file and review the output. The acceptance criterion is a profitable trading strategy, not code for the sake of code. Do not stop until profit is achieved.

3. After obtaining a profitable strategy, ALWAYS save the knowledge base used to build it into a markdown file with fundamental market analysis, following the naming pattern:

   * `./report/jan_2026.md`
   * `./report/feb_2026.md`
   * `./report/march_2026.md`

4. Run a code review as a separate agent.

   The code review must check the strategy for perpetual hold without strict exit conditions — for example, a trailing SL that shifts forever relative to the close of the last candle. I need not just to make money, but to mathematically identify where the money is in the market in order to avoid large portfolio liquidity drawdowns.

5. If the code review fails, incorporate the findings and rebuild the strategy from scratch following this guide.

### Recommendations

- Search the internet for ideas.

   I welcome borrowing trading ideas from other people via internet search rather than brute-forcing options. It's important not only to find someone else's concept but also to verify in practice that it is actually profitable.

- Analyze market structure.

   Looking at the candles reveals the structures present in the current month: sideways range, neutral trend, bullish trend, bearish trend, high volatility. Think through how to identify and how to act in each case.

- Use a TODO list.

   This guide has many steps. Form a TODO list and work through it step by step, marking each item complete. Include news research, candle `--dump` analysis, pine strategy analysis — as granularly as possible.

- Use deep research.

   The guide calls for intelligent market analysis, not code for the sake of code. Think carefully; don't cut corners on tokens.

- Think logically.

   A 1% target cannot be reached in less than 4 hours. A target below 1% is uninteresting because slippage will knock the position out before achieving an effective Risk/Reward. I don't need a formal reply — I need market analysis.

### Deliverable

A `.pine` file free of marketing fluff:

- Forbidden: TP=0.5% SL=-10% and any similar asymmetric nonsense. Risk management must be sound and must rule out holding on luck.
- Clearly described and commented operating modes with references to the time period on which they were tested.
- An honest profitability summary in the file header as a comment.
- An honest average daily signal count in the file header.
- An honest `sharpeRatio`, `avgPnl`, `stdDev` in the file header.
- One or more signals per day — more is better.

If it is impossible to make money, do not try to fudge the results. Write it as it is, without embellishment.