import { addExchangeSchema, roundTicks, runInMockContext } from "backtest-kit";
import ccxt from "ccxt";
import { singleshot } from "functools-kit";
import { position } from "../logic";

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

    return candles.map(([timestamp, open, high, low, close, volume], idx) => ({
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

const when = new Date("2026-04-05T11:00:00.000Z");

const research = {
  id: "123",
  reasoning:
    "Все отчёты образуют единую картину, в которой преобладают медвежьи сигналы. \n\n**Макро‑факторы**: Fed почти наверняка удержит ставку (97,9 % вероятность), высокий DXY и доходности 10‑летних облигаций делают риск‑активы менее привлекательными. Инфляция остаётся выше цели, а отсутствие снижения ставок сохраняет «cost of carry» в пользу фикс‑доходов.\n\n**Он‑чейн данные**: Запасы BTC на биржах находятся на историческом минимумe (≈ 5,9 % от эмиссии), отток крупными держателями (‑188 k BTC) и отрицательный net‑demand (‑63 k BTC). Хешрейт упал почти на 36 % от ATH, hashprice упал до $28‑$29/PH/день – почти без прибыли для большинства майнеров, комиссии находятся на 13‑летнем минимуме (2,5 BTC в день). Всё это указывает на падение спроса и давления вниз.\n\n**Торговая активность**: Снижение объёма торгов, отсутствие объёмных всплесков в дни падения цены, RSI ~44‑45 и цены ниже 20‑ и 50‑дневных EMA подтверждают ослабление бычьего импульса. Индекс страха‑жадности в зоне экстремального страха (8‑14) усиливает риск дальнейшего падения.\n\n**Бычьи новости**: накопления «китов» (≈ 270 k BTC), покупка MicroStrategy (22 k BTC) и потоки в BlackRock IBIT демонстрируют интерес крупных инвесторов, однако их объёмы сильно отстают от масштаба оттоков, а рост резервов бирж (незначительный, +2‑3 % за март) свидетельствует о потенциальных продажах. Позитивные регулятивные сигналы (классификация BTC как commodity) имеют долгосрочный, а не краткосрочный эффект.\n\n**Сводка**: При текущих макро‑условиях (жёсткая монетарная политика, сильный доллар), низкой он‑чейн ликвидности, падении майнерской доходности и сильном страхе рынка, бычьи факторы не способны переиграть системный давление вниз. Поэтому рыночная картина явно негативна, и оптимальный управленческий шаг – открыть короткую позицию.\n\n**Вывод**: Сигнал – **SELL**.",
  signal: "SELL",
} as const;

await runInMockContext(
  async () => {
    console.log(await position(research, "BTCUSDT", when));
  },
  {
    when,
    exchangeName: "ccxt-exchange",
  },
);
