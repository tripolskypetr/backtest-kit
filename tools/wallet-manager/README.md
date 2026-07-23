# wallet-manager

> **The typical broker-adapter implementation mistake** is trying to sell an asset while its funds are still frozen in a pending order. On spot, every resting order locks its quantity (the base coin for a SELL, USDT for a BUY): a sell placed on top of that lock fails with insufficient balance — or silently trades only the unlocked remainder while TP/SL/stale entry orders keep holding the rest. The correct sequence is always: **first cancel the pending orders, verify the book is clean, and only then sell the funds with a new order.** This is exactly why `commitCancel` (and the `onOrderCloseCommit` example below) cancels everything on the symbol and verifies zero open orders before selling the balance to cash.

Internal Binance **spot** wallet toolkit: a small DI-wired service layer over `node-binance-api` plus an interactive REPL. Two jobs:

1. Drive the exchange by hand — buy/sell/flatten a symbol, inspect balances, orders and PnL — without touching the trading engine.
2. Serve as the reference implementation for the exchange side of a [backtest-kit](../..) broker adapter: the `commit_*` functions in [`src/function/`](src/function/) are the exact order-management flows (post → poll → cancel → market fallback) the adapter example below is built from.

> **Live keys, real money.** Every `commit*` call below places real orders on Binance spot. There is no dry-run mode.

---

## Setup

Create `.env` in this directory:

```bash
CC_BINANCE_API_KEY=...
CC_BINANCE_API_SECRET=...
```

Start the REPL (builds the bundle first, loads `.env` via `dotenv`):

```bash
npm start
```

---

## Working with the REPL

The prompt evaluates raw JavaScript (`await` is allowed), pretty-prints object results as JSON, and exits on `exit`:

```
repl => await wallet.walletPublicService.fetchPrice("SOLUSDT")
77.56
repl => exit
```

Two globals are injected:

- `wallet` — the service container:
  - `wallet.walletPublicService` — **use this one.** Per-symbol serialized execution queue, argument validation, structured `console.log` audit record after every commit (`{ symbol, action, amountUSDT, averagePrice, date, status }`).
  - `wallet.walletPrivateService` — the raw layer underneath, no validation or queueing. For debugging only.
- `fs` — Node's `fs`, handy for dumping results (`fs.writeFileSync("out.json", JSON.stringify(result, null, 2))`).

### Read-only commands

```
repl => await wallet.walletPublicService.fetchPrice("SOLUSDT")
```
Current price. Cached for 30 seconds per symbol.

```
repl => await wallet.walletPublicService.fetchFiat("SOLUSDT")
```
USDT balance (free + locked).

```
repl => await wallet.walletPublicService.fetchBalance("SOLUSDT")
```
Balances for the known coin list as `{ [coin]: { quantity, usdt } }`. Quantity includes amounts locked in open orders (`onOrder`).

```
repl => await wallet.walletPublicService.fetchOrders("SOLUSDT", 25)
```
Recent orders (FILLED / CANCELED / NEW) with side, price, quantities and timestamps.

```
repl => await wallet.walletPublicService.fetchPnl("SOLUSDT", 25)
```
Daily PnL estimate reconstructed from trade history and 1h candles.

### Mutating commands

```
repl => await wallet.walletPublicService.commitBuy("SOLUSDT", 20)
```
Guarded entry for `amountUSDT` worth of coin. Returns `0` without trading when the symbol already has open orders or free USDT is below the amount. Otherwise: limit BUY slightly above market (`avg × 1.001`), fill polled every 10s up to 10 times; on timeout the order is **cancelled and the remainder is market-bought** — the entry never stays resting on the book. Returns the average fill price.

```
repl => await wallet.walletPublicService.commitSell("SOLUSDT", 20)
```
Sells `amountUSDT` worth of coin: limit SELL, same poll loop, same cancel + market-sell fallback on timeout.

```
repl => await wallet.walletPublicService.commitTrade("SOLUSDT", 20, 85.0, 74.0)
```
Entry + brackets in one call: validates `takeProfit > price > stopLoss`, buys via the `commitBuy` flow, then protects the position with an OCO sell (take-profit limit + stop-loss limit).

```
repl => await wallet.walletPublicService.commitCancel("SOLUSDT")
```
**Flatten the symbol — cancel everything and exit to cash.** Cancels ALL open orders on the symbol (up to 10 rounds, tolerating individual cancel failures), verifies the book is clean, then sells the **entire free coin balance** to USDT: limit SELL at `price × 0.999`, poll loop, cancel + market-sell fallback. Dust below `minQty` is left untouched (returns `0`).

---

## Broker adapter example (backtest-kit)

The adapter below wires these flows into the backtest-kit broker gate. Three rules it encodes:

1. **A transient throw must never leave an order resting on the exchange.** Before throwing: cancel the unfilled order and market-out any partial fill. Otherwise every "will retry" leaves one more live order on the book that can fill later on its own — the engine will know nothing about it.
2. **`payload.attempt > 0` means the previous attempt may have reached the exchange.** The engine passes `attempt` exactly for this: before posting again, reconcile by `clientOrderId` (= `signalId`) — a lost response to a filled order must resolve to "already bought", not to a second buy. Note Binance's duplicate-`clientOrderId` guard only covers **open** orders; an instantly filled one would not be deduplicated.
3. **The fifth attempt is terminal.** The engine's default budget is `CC_ORDER_OPEN_RETRY_ATTEMPTS = 5`, so `attempt` arrives as 0–4 and `attempt === 4` is the last try. On it: cancel the order, market-sell whatever was actually bought (`executedQty`), and throw `OrderRejectedError` — the terminal rejection makes the engine consume the signal id (`lastPendingId`), so the signal is never re-issued. A plain `Error` is treated as transient and the engine keeps retrying.

Position close (`onOrderCloseCommit`) follows the `commitCancel` flow: cancel every open order on the symbol, then sell the **entire** free coin balance to cash — which also sweeps any orphan tranches bought outside the engine.

```typescript
import {
  Broker,
  BrokerBase,
  BrokerOrderOpenPayload,
  BrokerOrderClosePayload,
  OrderRejectedError,
} from "backtest-kit";
import { memoize, sleep } from "functools-kit";
import Binance from "node-binance-api";

const FILL_POLL_ATTEMPTS = 10;         // 10 checks ...
const FILL_POLL_INTERVAL_MS = 10_000;  // ... every 10 seconds = up to ~100s waiting for the fill
const LAST_OPEN_ATTEMPT = 4;           // the fifth try under CC_ORDER_OPEN_RETRY_ATTEMPTS = 5
const CANCEL_ROUNDS = 10;              // cancel sweeps while flattening the symbol on close
const TRADE_SELL_LOWER_PERCENT = 0.999; // exit limit price slightly below market — fills faster

const roundTicks = (value: number, tickSize: string) => {
  const precision = Math.max(tickSize.replace(/0+$/, "").indexOf("1") - 1, 0);
  return Number(value).toFixed(precision);
};

const getExchangeInfo = memoize(
  ([symbol, filterType]) => `${symbol}-${filterType}`,
  async (symbol: string, filterType = "LOT_SIZE", binance: Binance) => {
    const exchangeInfo = await binance.exchangeInfo();
    const filters = Object.values(exchangeInfo.symbols)
      .map(({ symbol, filters }) => [
        symbol,
        filters.find((f: any) => f.filterType === filterType),
      ])
      .reduce<any>((acm, [k, v]) => ({ ...acm, [k]: v }), {});
    const { stepSize, tickSize, minQty } = filters[symbol];
    return { stepSize, tickSize, minQty };
  }
);

const formatQuantity = async (symbol: string, quantity: number, binance: Binance) => {
  const { stepSize } = await getExchangeInfo(symbol, "LOT_SIZE", binance);
  return roundTicks(quantity, stepSize);
};

const formatPrice = async (symbol: string, price: number, binance: Binance) => {
  const { tickSize } = await getExchangeInfo(symbol, "PRICE_FILTER", binance);
  return roundTicks(price, tickSize);
};

const getCoinName = (symbol: string) => symbol.replace(/USDT$/, "");

const percentValue = (value: number, percent: number) => (value * percent) / 100;

class SpotBroker extends BrokerBase {
  override async waitForInit() {
    await getBinance(); // your singleshot instance; the recommended place for an orphan sweep by clientOrderId
  }

  override async onOrderOpenCommit(payload: BrokerOrderOpenPayload) {
    if (payload.backtest) return;          // never touch the exchange in backtest mode
    if (payload.type !== "active") return; // "schedule" (resting-order placement) is a separate branch
    const { symbol, signalId, attempt, cost, priceOpen } = payload;
    const binance = await getBinance();

    // Rule 2: attempt > 0 — the previous attempt may have reached the exchange.
    // Reconcile by clientOrderId BEFORE posting again: an order filled behind a
    // lost response resolves to "already bought", a stale one gets cancelled.
    if (attempt > 0) {
      const prior = await binance
        .orderStatus(symbol, undefined, undefined, { origClientOrderId: signalId })
        .catch(() => null);
      if (prior?.status === "FILLED") {
        return; // the position was already opened by the previous attempt — confirm without re-sending
      }
      if (prior && (prior.status === "NEW" || prior.status === "PARTIALLY_FILLED")) {
        await binance.cancel(symbol, prior.orderId); // kill the stale remainder
      }
    }

    const quantity = await formatQuantity(symbol, cost / priceOpen, binance);
    const price = await formatPrice(symbol, priceOpen, binance);

    // clientOrderId = signalId — the idempotency anchor for the reconcile above
    const order = await binance.order("LIMIT", "BUY", symbol, Number(quantity), Number(price), {
      newClientOrderId: signalId,
    });

    if (order.status === "FILLED") {
      return; // confirmed — the engine opens the position
    }

    // Wait for the order to close: await + sleep in a loop
    let last = order;
    for (let i = 0; i !== FILL_POLL_ATTEMPTS; i++) {
      await sleep(FILL_POLL_INTERVAL_MS);
      last = await binance.orderStatus(symbol, order.orderId);
      if (last.status === "FILLED") {
        return; // fill arrived — confirm
      }
    }

    // Rule 1: timeout — the order must NOT stay alive on the exchange.
    // Cancel and roll back the partial fill so the state is clean before the retry.
    await binance.cancel(symbol, order.orderId);
    const executedQty = Number(last?.executedQty ?? 0);
    if (executedQty > 0) {
      const sellQty = await formatQuantity(symbol, executedQty, binance);
      await binance.marketSell(symbol, Number(sellQty));
    }

    // Rule 3: the fifth attempt is a terminal rejection. The engine consumes
    // OrderRejectedError into lastPendingId: this signal id is never re-issued.
    if (attempt >= LAST_OPEN_ATTEMPT) {
      throw new OrderRejectedError(
        `entry ${signalId} not filled after ${attempt + 1} attempts — giving up`
      );
    }

    // Transient: the engine retries on the next tick with the SAME signalId,
    // attempt arrives incremented — the reconcile at the top kicks in.
    throw new Error(`Limit order [buy ${quantity} ${symbol} @ ${price}] not filled — backtest-kit will retry`);
  }

  // Closing a position = "drop everything on the symbol and exit to cash":
  // cancel ALL open orders (TP/SL/stale limit orders — including artifacts of
  // previous attempts) and sell the ENTIRE free coin balance to USDT — not just
  // the engine's position size, so orphan tranches bought outside the engine
  // are swept by the same exit. Any throw from here is transient: the engine
  // keeps the position open and retries the close on the next tick with
  // attempt+1; on exhausting CC_ORDER_CLOSE_RETRY_ATTEMPTS it force-closes its
  // own state (fatal exit AFTER the durable teardown — 16.5.x fix).
  override async onOrderCloseCommit(payload: BrokerOrderClosePayload) {
    if (payload.backtest) return; // never touch the exchange in backtest mode
    const { symbol, currentPrice } = payload;
    const binance = await getBinance();
    const coinName = getCoinName(symbol);

    // Step 1: cancel every open order on the symbol (up to CANCEL_ROUNDS sweeps,
    // individual cancel failures are tolerated — the sweep repeats)
    {
      let error;
      for (let i = 0; i !== CANCEL_ROUNDS; i++) {
        let isOk = true;
        const orders = await binance.openOrders(symbol);
        for (const order of orders) {
          try {
            await sleep(1_000);
            await binance.cancel(symbol, order.orderId);
            error = null;
          } catch (e) {
            isOk = false;
            error = e;
            continue;
          }
        }
        if (!orders.length) {
          error = null;
          break;
        }
        if (isOk) {
          break;
        }
      }
      if (error) {
        throw error; // transient — the engine retries the close on the next tick
      }
    }

    // Step 2: verify not a single live order is left on the symbol
    {
      let error;
      for (let i = 0; i !== CANCEL_ROUNDS; i++) {
        try {
          await sleep(1_000);
          const { length: hasOrders } = await binance.openOrders(symbol);
          if (hasOrders) {
            error = new Error("Order not canceled");
          } else {
            error = null;
            break;
          }
        } catch (e) {
          error = e;
        }
      }
      if (error) {
        throw error;
      }
    }

    // Step 3: exit to cash — sell the ENTIRE free coin balance
    const account = await binance.account();
    const coinBalance = account.balances.find(({ asset }) => asset === coinName);
    if (!coinBalance) {
      throw new Error(`Can't fetch balance (close) for ${coinName}`);
    }
    const freeQty = parseFloat(coinBalance.free);

    const { minQty } = await getExchangeInfo(symbol, "LOT_SIZE", binance);
    if (!minQty) {
      throw new Error(`Can't fetch minimal quantity (close) for ${coinName}`);
    }
    const maker = account.makerCommission / 100;

    const quantity = freeQty - percentValue(freeQty, maker) - Number(minQty);
    if (quantity <= Number(minQty)) {
      return; // dust — nothing to sell, confirm the close
    }

    const sellQty = await formatQuantity(symbol, quantity, binance);
    const sellPrice = await formatPrice(
      symbol,
      currentPrice * TRADE_SELL_LOWER_PERCENT,
      binance
    );

    const order = await binance.order("LIMIT", "SELL", symbol, Number(sellQty), Number(sellPrice));
    if (order.status === "FILLED") {
      return; // cashed out — the engine records the close
    }

    // Same wait loop (await + sleep) as on open
    let last = order;
    for (let i = 0; i !== FILL_POLL_ATTEMPTS; i++) {
      await sleep(FILL_POLL_INTERVAL_MS);
      last = await binance.orderStatus(symbol, order.orderId);
      if (last.status === "FILLED") {
        return;
      }
    }

    // The limit order did not fill — cancel it and finish the remainder with a
    // market sell: the cash exit is guaranteed, the position never stays hanging
    await binance.cancel(symbol, order.orderId);
    const restQty = await formatQuantity(
      symbol,
      Number(sellQty) - Number(last?.executedQty ?? 0),
      binance
    );
    await binance.marketSell(symbol, Number(restQty));
  }

  // onOrderActiveCheck / onPartial*Commit and the remaining hooks —
  // as in your current implementation (BrokerBase provides defaults for the rest)
}

Broker.useBrokerAdapter(SpotBroker);
Broker.enable();
```

Before waiting hours for a real signal, any single hook can be dry-fired against the live adapter from the CLI:

```bash
npx @backtest-kit/cli --brokerdebug --commit signal-open --symbol SOLUSDT
```
