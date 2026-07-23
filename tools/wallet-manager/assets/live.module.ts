// Live-модуль jan_2026 (spot) — ИСПРАВЛЕННЫЙ финальный вариант.
// Замена content/jan_2026.strategy/modules/live.module.ts (разбор баги — FIXME.md).
//
// Методология tools/wallet-manager:
//   - вход = commit_buy: лимитка + полл, по таймауту cancel и market-добивка
//     остатка — вход гарантирован, ордер на бирже не остаётся;
//   - брекеты = commit_trade: TP+SL одним OCO — одна заморозка средств
//     (два независимых sell на один объём на споте невозможны — корень каскада);
//   - закрытие = commit_cancel: снять ВСЕ ордера по символу с верификацией
//     чистого стакана, затем продать ВЕСЬ свободный баланс монеты в кеш.
//
// Скоуп файла: только открытие/закрытие (onOrderOpenCommit / onOrderCloseCommit).
// Partial/trailing/breakeven/averageBuy-хуки обязаны следовать тем же правилам
// (cancel first → verify → sell; OCO вместо пары sell) — вне этого файла.
import {
  addExchangeSchema,
  roundTicks,
  setConfig,
  Broker,
  OrderTransientError,
  OrderRejectedError,
} from "backtest-kit";
import type {
  IBroker,
  BrokerOrderOpenPayload,
  BrokerOrderClosePayload,
} from "backtest-kit";
import { singleshot, sleep } from "functools-kit";
import ccxt from "ccxt";

type Binance = InstanceType<typeof ccxt.binance>;

setConfig({
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100,
  // Размер входа $20: депозит ~$95 — до 4 одновременных позиций + запас над
  // биржевым минимумом $5 (решение владельца 22.07, №112а).
  CC_POSITION_ENTRY_COST: 20,
});

// --- Данные: публичный spot-клиент ---

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: {
      defaultType: "spot",
      adjustForTimeDifference: true,
      recvWindow: 60000,
    },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

addExchangeSchema({
  exchangeName: "ccxt-exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(
      symbol,
      interval,
      since.getTime(),
      limit,
    );
    return candles.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    }));
  },
  getOrderBook: async (symbol, depth) => {
    const exchange = await getExchange();
    const bookData = await exchange.fetchOrderBook(symbol, depth);
    return {
      symbol,
      asks: bookData.asks.map(([price, quantity]) => ({
        price: String(price),
        quantity: String(quantity),
      })),
      bids: bookData.bids.map(([price, quantity]) => ({
        price: String(price),
        quantity: String(quantity),
      })),
    };
  },
  formatPrice: async (symbol, price) => {
    const exchange = await getExchange();
    const market = exchange.market(symbol);
    const tickSize = market.limits?.price?.min || market.precision?.price;
    if (tickSize !== undefined) {
      return roundTicks(price, tickSize);
    }
    return exchange.priceToPrecision(symbol, price);
  },
  formatQuantity: async (symbol, quantity) => {
    const exchange = await getExchange();
    const market = exchange.market(symbol);
    const stepSize = market.limits?.amount?.min || market.precision?.amount;
    if (stepSize !== undefined) {
      return roundTicks(quantity, stepSize);
    }
    return exchange.amountToPrecision(symbol, quantity);
  },
});

// --- Исполнение ---

const FILL_POLL_INTERVAL_MS = 10_000;  // полл филла: 10 проверок ...
const FILL_POLL_ATTEMPTS = 10;         // ... раз в 10 секунд = до ~100с ожидания
const CANCEL_SETTLE_MS = 2_000;        // пауза после cancel перед перечитыванием
const CANCEL_ROUNDS = 10;              // заходы cancel-sweep при закрытии
const STOP_LIMIT_SLIPPAGE = 0.995;     // stop-limit цена чуть ниже триггера SL
const TRADE_SELL_LOWER_PERCENT = 0.999; // лимит-цена выхода чуть ниже рынка

// Сетевой класс ccxt (RequestTimeout, ExchangeNotAvailable, DDoSProtection...)
// → transient (bounded retry движка с тем же signalId); всё остальное от биржи
// (InsufficientFunds, InvalidOrder, min-notional...) → постоянный отказ.
function toTypedError(e: unknown): Error {
  if (e instanceof ccxt.NetworkError) {
    return OrderTransientError.fromError(e as object);
  }
  if (e instanceof ccxt.ExchangeError) {
    return OrderRejectedError.fromError(e as object);
  }
  return e as Error;
}

// Binance: -2013 "Order does not exist" при запросе по origClientOrderId
function isOrderNotFound(e: unknown): boolean {
  return String((e as Error)?.message ?? "").includes("-2013");
}

// Сверка входа по clientOrderId = signalId: был ли прошлый POST исполнен.
// null = ордера с таким id нет (слать заново); иначе — статус и исполненный объём.
async function fetchEntryByClientId(
  exchange: Binance,
  symbol: string,
  signalId: string,
): Promise<{ orderId: string; status: string; executedQty: number } | null> {
  const market = exchange.market(symbol);
  try {
    const raw = await (exchange as any).privateGetOrder({
      symbol: market.id,
      origClientOrderId: signalId,
    });
    return {
      orderId: String(raw.orderId),
      status: String(raw.status),
      executedQty: parseFloat(raw.executedQty ?? "0"),
    };
  } catch (e) {
    if (isOrderNotFound(e)) return null;
    throw toTypedError(e);
  }
}

const getSpotExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_API_SECRET,
    options: {
      defaultType: "spot",
      adjustForTimeDifference: true,
      recvWindow: 60000,
    },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

function getBase(exchange: Binance, symbol: string): string {
  return exchange.markets[symbol].base;
}

function truncateQty(exchange: Binance, symbol: string, qty: number): number {
  return parseFloat(exchange.amountToPrecision(symbol, qty));
}

async function fetchFreeQty(exchange: Binance, symbol: string): Promise<number> {
  const balance = await exchange.fetchBalance();
  const base = getBase(exchange, symbol);
  return parseFloat(String(balance?.free?.[base] ?? 0));
}

// Суммарный баланс монеты: free + залоченное в открытых ордерах. Отвечать на
// вопрос «куплена ли позиция» можно ТОЛЬКО по нему: после успешного входа
// монеты заморожены в OCO и free ≈ 0 — проверка по free путала купленную
// позицию с раскрученной и покупала повторно (задвоение, поймано вторым
// open'ом в тесте).
async function fetchTotalQty(exchange: Binance, symbol: string): Promise<number> {
  const balance = await exchange.fetchBalance();
  const base = getBase(exchange, symbol);
  const free = parseFloat(String(balance?.free?.[base] ?? 0));
  const used = parseFloat(String(balance?.used?.[base] ?? 0));
  return free + used;
}

// Отмена с обработкой гонки «филл против cancel»: ордер мог исполниться между
// последним поллом и cancel — тогда cancel падает (-2011), и это ФИЛЛ, не отказ
// (исходная версия превращала его в терминальный дроп реально купленного входа).
async function cancelOrderSafe(
  exchange: Binance,
  orderId: string,
  symbol: string,
): Promise<"canceled" | "filled"> {
  try {
    await exchange.cancelOrder(orderId, symbol);
    return "canceled";
  } catch (cancelErr) {
    const status = await exchange.fetchOrder(orderId, symbol);
    if (status.status === "closed") return "filled";
    throw toTypedError(cancelErr);
  }
}

// commit_cancel: снятие ВСЕХ ордеров по символу с ретраями и ВЕРИФИКАЦИЕЙ, что
// стакан чист. Продавать можно только незамороженные средства — продажа поверх
// живого sell-ордера падает insufficient balance (типовая ошибка адаптеров).
async function cancelSweepAndVerify(exchange: Binance, symbol: string): Promise<void> {
  {
    let error: unknown = null;
    for (let i = 0; i !== CANCEL_ROUNDS; i++) {
      let isOk = true;
      const orders = await exchange.fetchOpenOrders(symbol);
      for (const order of orders) {
        try {
          await sleep(1_000);
          await exchange.cancelOrder(order.id, symbol);
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
      throw toTypedError(error);
    }
  }
  {
    let error: unknown = null;
    for (let i = 0; i !== CANCEL_ROUNDS; i++) {
      try {
        await sleep(1_000);
        const { length: hasOrders } = await exchange.fetchOpenOrders(symbol);
        if (hasOrders) {
          error = new Error(`Orders still open for ${symbol} after cancel sweep`);
        } else {
          error = null;
          break;
        }
      } catch (e) {
        error = e;
      }
    }
    if (error) {
      throw toTypedError(error);
    }
  }
}

// commit_trade: TP+SL одним OCO — одна заморозка средств, оба уровня встают
// атомарно. Исходная пара «limit sell + stop_loss_limit sell» на один объём
// невозможна на споте: TP замораживал монеты, SL падал InsufficientFunds.
async function placeBracketsOco(
  exchange: Binance,
  symbol: string,
  qty: number,
  tpPrice: number,
  slPrice: number,
): Promise<void> {
  const market = exchange.market(symbol);
  await (exchange as any).privatePostOrderOco({
    symbol: market.id,
    side: "SELL",
    quantity: exchange.amountToPrecision(symbol, qty),
    price: exchange.priceToPrecision(symbol, tpPrice),        // TP limit
    stopPrice: exchange.priceToPrecision(symbol, slPrice),    // SL триггер
    stopLimitPrice: exchange.priceToPrecision(symbol, slPrice * STOP_LIMIT_SLIPPAGE),
    stopLimitTimeInForce: "GTC",
  });
}

// Аварийная раскрутка: СНАЧАЛА разморозить (cancel-sweep + верификация), потом
// market-sell свободного остатка. Исходная версия продавала то, что сама же
// заморозила TP-ордером, — раскрутка падала, а сырая ошибка демотировала
// постоянный отказ биржи до вечного транзиента. Исходная ошибка ВСЕГДА доходит
// до движка типизированной.
async function unwindPosition(
  exchange: Binance,
  symbol: string,
  originalErr: unknown,
): Promise<never> {
  try {
    await cancelSweepAndVerify(exchange, symbol);
    const freeQty = truncateQty(exchange, symbol, await fetchFreeQty(exchange, symbol));
    if (freeQty > 0) {
      await exchange.createOrder(symbol, "market", "sell", freeQty);
    }
  } catch {
    // раскрутка не удалась — позицию выверяет оператор; важнее исходная ошибка
  }
  throw toTypedError(originalErr);
}

// commit_buy: лимитка + полл (await + sleep), по таймауту cancel (гонка учтена)
// и market-добивка остатка — вход гарантирован, ордер на бирже не остаётся.
async function buyLimitGuaranteed(
  exchange: Binance,
  symbol: string,
  qty: number,
  price: number,
  clientOrderId: string,
): Promise<void> {
  const order = await exchange.createOrder(symbol, "limit", "buy", qty, price, {
    clientOrderId,
  });

  let last = order;
  if (last.status !== "closed") {
    let filled = false;
    for (let i = 0; i !== FILL_POLL_ATTEMPTS; i++) {
      await sleep(FILL_POLL_INTERVAL_MS);
      last = await exchange.fetchOrder(order.id, symbol);
      if (last.status === "closed") {
        filled = true;
        break;
      }
    }
    if (!filled) {
      if ((await cancelOrderSafe(exchange, order.id, symbol)) === "filled") {
        return; // исполнился на флажке — это филл
      }
      await sleep(CANCEL_SETTLE_MS);
      const final = await exchange.fetchOrder(order.id, symbol);
      const remainder = truncateQty(exchange, symbol, qty - (final.filled ?? 0));
      if (remainder > 0) {
        await exchange.createOrder(symbol, "market", "buy", remainder);
      }
    }
  }
}

Broker.useBrokerAdapter(
  class implements Partial<IBroker> {
    async waitForInit(): Promise<void> {
      await getSpotExchange();
    }

    async onOrderOpenCommit(payload: BrokerOrderOpenPayload): Promise<void> {
      if (payload.backtest) return;
      if (payload.type === "schedule") return; // отложенный вход отслеживает движок
      const { symbol, signalId, cost, priceOpen, priceTakeProfit, priceStopLoss, position } = payload;

      if (position === "short") {
        // бизнес-отказ навсегда: спот шортов не знает — дроп без ретраев
        throw new OrderRejectedError(
          `SpotBrokerAdapter: short position is not supported on spot (symbol=${symbol})`,
        );
      }

      const exchange = await getSpotExchange();

      const openPrice = parseFloat(exchange.priceToPrecision(symbol, priceOpen));
      const tpPrice = parseFloat(exchange.priceToPrecision(symbol, priceTakeProfit));
      const slPrice = parseFloat(exchange.priceToPrecision(symbol, priceStopLoss));
      const minNotional = exchange.markets[symbol]?.limits?.cost?.min ?? 1;

      // Брекеты на фактический свободный остаток; провал брекетов = провал
      // входа целиком: раскрутка (cancel first → market sell) + типизированный
      // вердикт движку.
      const confirmWithBrackets = async (): Promise<void> => {
        const bracketQty = truncateQty(exchange, symbol, await fetchFreeQty(exchange, symbol));
        if (bracketQty <= 0) return;
        try {
          await placeBracketsOco(exchange, symbol, bracketQty, tpPrice, slPrice);
        } catch (err) {
          await unwindPosition(exchange, symbol, err);
        }
      };

      try {
        // Сверка по clientOrderId = signalId БЕЗУСЛОВНО, не только при attempt > 0:
        // свежая строка того же id (после дропа ретрай-слота ревалидацией движка)
        // приходит с attempt = 0 — гард по attempt пропускал её и покупал повторно.
        // Для нового id сверка стоит один вызов (-2013 → null → слать заново).
        const prior = await fetchEntryByClientId(exchange, symbol, signalId);

        if (prior && prior.executedQty > 0) {
          // Прошлый POST исполнился (потерянный ответ / крэш до брекетов).
          // Куплена ли позиция — решает СУММАРНЫЙ баланс (free + used): после
          // успешного входа монеты заморожены в OCO, free ≈ 0, и проверка по
          // free срабатывала веткой «покупаем заново» — задвоение позиции.
          const totalQty = await fetchTotalQty(exchange, symbol);
          if (totalQty * openPrice >= minNotional) {
            // Брекеты добрасываем только если живых ордеров нет: висящий OCO
            // уже сторожит позицию, второй лёг бы поверх заморозки.
            const { length: hasOrders } = await exchange.fetchOpenOrders(symbol);
            if (!hasOrders) {
              await confirmWithBrackets();
            }
            return; // вход подтверждён по clientOrderId — покупку НЕ повторяем
          }
          // суммарного остатка нет — прошлый вход уже раскручен (unwind), покупаем заново
        } else if (prior && (prior.status === "NEW" || prior.status === "PARTIALLY_FILLED")) {
          // Живой ордер прошлой попытки: СНАЧАЛА снять (clientOrderId
          // освобождается — не будет -2010 duplicate), потом открывать заново.
          // Исходная версия постила дубль поверх живого NEW → -2010 →
          // терминальный дроп при живом собственном ордере на бирже.
          if ((await cancelOrderSafe(exchange, prior.orderId, symbol)) === "filled") {
            await confirmWithBrackets();
            return; // исполнился на флажке — это филл прошлой попытки
          }
          await sleep(CANCEL_SETTLE_MS);
        }

        // СПОТ-САЙЗИНГ ПО КЭШУ: на споте купить можно только на живой USDT.
        // min(номинал, 98% свободного USDT) — запас 2% на комиссию/округление.
        const freeUsdt = parseFloat(String((await exchange.fetchBalance())?.free?.["USDT"] ?? 0));
        const effectiveCost = Math.min(cost, freeUsdt * 0.98);
        if (effectiveCost < minNotional) {
          // кэша меньше минимального нотионала — торговать нечем; постоянный
          // дроп без ретраев, чтобы не спамить каждую минуту
          throw new OrderRejectedError(
            `SpotBrokerAdapter: free USDT ${freeUsdt.toFixed(2)} → cost ${effectiveCost.toFixed(2)} < minNotional ${minNotional} (${symbol}) — вход пропущен`,
          );
        }
        const qty = truncateQty(exchange, symbol, effectiveCost / priceOpen);
        if (qty <= 0) {
          throw new OrderRejectedError(
            `Computed qty is zero for ${symbol} — cost=${effectiveCost}, price=${priceOpen}`,
          );
        }

        await buyLimitGuaranteed(exchange, symbol, qty, openPrice, signalId);
      } catch (err) {
        throw toTypedError(err);
      }

      await confirmWithBrackets();
    }

    async onOrderCloseCommit(payload: BrokerOrderClosePayload): Promise<void> {
      if (payload.backtest) return;
      const { symbol, currentPrice } = payload;
      const exchange = await getSpotExchange();

      try {
        // Шаги 1-2 (commit_cancel): разморозить средства и УБЕДИТЬСЯ, что по
        // символу не осталось ни одного живого ордера — только после этого
        // весь баланс монеты доступен к продаже.
        await cancelSweepAndVerify(exchange, symbol);

        // Шаг 3: выйти в кеш — продать ВЕСЬ свободный баланс монеты (не только
        // объём позиции движка: заодно подметаются транши-сироты).
        const freeQty = truncateQty(exchange, symbol, await fetchFreeQty(exchange, symbol));
        const minNotional = exchange.markets[symbol]?.limits?.cost?.min ?? 1;
        if (freeQty * currentPrice < minNotional) {
          return; // пыль — позиция уже пуста, закрытие подтверждаем
        }

        const sellPrice = parseFloat(
          exchange.priceToPrecision(symbol, currentPrice * TRADE_SELL_LOWER_PERCENT),
        );
        const order = await exchange.createOrder(symbol, "limit", "sell", freeQty, sellPrice);

        let last = order;
        if (last.status !== "closed") {
          let filled = false;
          for (let i = 0; i !== FILL_POLL_ATTEMPTS; i++) {
            await sleep(FILL_POLL_INTERVAL_MS);
            last = await exchange.fetchOrder(order.id, symbol);
            if (last.status === "closed") {
              filled = true;
              break;
            }
          }
          if (!filled) {
            // Лимиткой не продалось — снять (гонка учтена) и добить остаток
            // маркетом: выход в кеш гарантирован, ордер на бирже не остаётся.
            if ((await cancelOrderSafe(exchange, order.id, symbol)) !== "filled") {
              await sleep(CANCEL_SETTLE_MS);
              const final = await exchange.fetchOrder(order.id, symbol);
              const remainder = truncateQty(exchange, symbol, freeQty - (final.filled ?? 0));
              if (remainder > 0) {
                await exchange.createOrder(symbol, "market", "sell", remainder);
              }
            }
          }
        }
      } catch (err) {
        // сеть → transient: движок держит позицию и ретраит close следующим
        // тиком (bounded CC_ORDER_CLOSE_RETRY_ATTEMPTS, затем force-close —
        // реальную позицию выверяет оператор); отказ биржи → rejected.
        // Брекеты при этом уже сняты — до успешного close позицию сторожит
        // софт-SL движка, повторный заход начнётся с cancel-sweep (идемпотентно).
        throw toTypedError(err);
      }
    }
  },
);

Broker.enable();
// listenExit НЕ вайрим: @backtest-kit/cli сам дропает процесс на exitEmitter —
// systemd перезапустит.
