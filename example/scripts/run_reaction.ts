import { runInMockContext } from "backtest-kit";

import { reaction } from "../logic";

import { addExchangeSchema, roundTicks } from "backtest-kit";
import { singleshot } from "functools-kit";
import ccxt from "ccxt";

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

const exchangeName = "ccxt-exchange";

addExchangeSchema({
  exchangeName,
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

const BUY_DATE = "2026-02-27T12:00:00.000Z";

const when = new Date(BUY_DATE);
const symbol = "BTCUSDT";

const PRICE_IN_FORECAST = {
  "sentiment": "bearish",
  "reasoning": "Главные новости за последние 24 ч. указывают на падение риска и негативные настроения на рынках, что вредит биткойну:\n1. WSJ: американские индексы (Dow, S&P 500, Nasdaq) резко упали, акции Nvidia и другие технологические компании продолжают падать, а инфляция ускорилась – типичный сигнал притока в безопасные активы и оттока из криптовалют. Цена Bitcoin в этой статье упала на 2 % до 66 000 USD.\n2. Reuters: рост китайского юаня и действия центрального банка Китая, направленные на замедление его укрепления, вызывают ожидания дополнительного давления на доллар, что обычно не поддерживает риск‑активы.\n3. Reuters: «AI horror stories» и опасения по поводу искусственного интеллекта усиливают опасения инвесторов, способствующие осторожности.\n4. Несмотря на рост европейских акций и цены на нефть, эти новости локальны и не компенсируют общую негативную динамику в США, где сосредоточен основной объём капитала, влияющий на криптовалютный рынок.\nИтог: доминирующая сила – ухудшение настроений в США и рост риск‑аппетита уравновешена только отдельными позитивными новостями, поэтому общий рыночный сентимент к Bitcoin считается bearish."
} as const;

runInMockContext(async () => {
  console.log(await reaction(PRICE_IN_FORECAST, symbol, when));
}, {
    when,
    symbol,
    exchangeName,
});
