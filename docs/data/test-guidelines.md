---
title: data/test-guidelines
group: data
---

# Test Guidelines

## Key files
- `src/helpers/getEffectivePriceOpen.ts` — cost-basis replay algorithm (DO NOT MODIFY)
- `src/helpers/toProfitLossDto.ts` — weighted PNL with partial close replay (DO NOT MODIFY)
- `test/spec/dca.test.mjs` — 35 unit tests for DCA+partial logic
- `test/e2e/dca.test.mjs` — 9 e2e tests: partial profit/loss interleaved with DCA
- `test/migration/migrate7.test.mjs` — 2 migration tests: trailing stop breakeven, partialLoss
- `test/e2e/average.test.mjs` — reference pattern for e2e backtest tests
- `test/README.md` — comprehensive test writing guide (read before writing e2e tests)

## Algorithm: cost-basis replay
Running `costBasis` through all partials sequentially:
```
costBasis = 0
for each partial[i]:
  newEntries = entryCountAtClose[i] - entryCountAtClose[i-1]  (0 for i=0)
  costBasis += newEntries * 100
  dollarValue = (percent[i] / 100) * costBasis    ← correct running basis
  costBasis *= (1 - percent[i] / 100)             ← reduce after each close
weight[i] = dollarValue[i] / totalInvested
```

## Snap computation rule (for test expected values)
- `snap[0]` = `hm(entries[0..cnt[0]])` when no prior partials
- `snap[i≥1]` = must use `getEff(entries[0..cnt[i]], partials[0..i-1])` — NOT plain harmonic mean
  - Formula: `(remainingCostBasis + newDCA*100) / (remainingCostBasis/snap[i-1] + Σ100/newPrice)`

## e2e test pattern
```js
addExchangeSchema({ exchangeName: "binance-X", getCandles, formatPrice, formatQuantity })
addStrategySchema({ strategyName: "test-X", interval: "1m", getSignal, callbacks: { onActivePing, onClose, ... } })
addFrameSchema({ frameName: "Nm-X", interval: "1m", startDate, endDate })
const awaitSubject = new Subject();
listenDoneBacktest(() => awaitSubject.next());
const unsubscribeError = listenError((error) => { errorCaught = error; awaitSubject.next(); });
Backtest.background("BTCUSDT", { strategyName, exchangeName, frameName });
await awaitSubject.toPromise();
unsubscribeError();
```

## Key e2e rules (from README)
- Buffer candles ABOVE priceOpen for LONG (below for SHORT) before startTime — prevent early scheduled activation
- All candles rebuilt inside first `getSignal` call (signalGenerated flag); getCandles returns from allCandles array
- LONG activates when `candle.low <= priceOpen`; SHORT when `candle.high >= priceOpen`
- SL checked BEFORE activation — activation candle low must not hit SL simultaneously
- `getAveragePrice(symbol)` needs min 5 candles
- Frame endDate must match candle count exactly (N candles = N minutes with 1m interval)
- `CC_MAX_STOPLOSS_DISTANCE_PERCENT: 20` — SL can be at most 20% from entry; violations silently break tests
- `CC_AVG_PRICE_CANDLES_COUNT: 5` — VWAP window; first 4 candles skipped as buffer in pending processing
- `minuteEstimatedTime` must fit within frame; if candles run out before time expires → error thrown
- `onPartialProfit` / `onPartialLoss` fire based on VWAP (averagePrice), not candle.close
- `revenuePercent` in `onPartialProfit` = % progress toward TP (0–100), NOT P&L %
- `revenuePercent` in `onPartialLoss` = % progress toward SL (0–100)

## Partial close API
- `commitPartialProfit(symbol, percentToClose)` — close X% at profit; requires currentPrice > effectivePriceOpen for LONG
- `commitPartialLoss(symbol, percentToClose)` — close X% at loss; requires currentPrice < effectivePriceOpen for LONG
- `commitAverageBuy(symbol)` — DCA entry (rejected if price unfavorable direction)
- `commitTrailingStop(symbol, percentShift, currentPrice)` — shift SL by percent from original distance
- All called from callbacks (`onActivePing`, `onPartialProfit`, `onPartialLoss`) with `await`
- `Backtest.getPendingSignal(symbol, context)` — returns current signal state including priceOpen, priceStopLoss

## getEffectivePriceOpen plain-signal behavior
- No `_entry` → returns `signal.priceOpen` immediately (line 23)
- No change in math for plain entries; refactor only affects DCA+partial cases

## Test index
`test/index.mjs` — import list controls which test files run
