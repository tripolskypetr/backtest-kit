import {
  Broker,
  BrokerAverageBuyPayload,
  BrokerBreakevenPayload,
  BrokerPartialLossPayload,
  BrokerPartialProfitPayload,
  BrokerSignalClosePayload,
  BrokerSignalOpenPayload,
  BrokerTrailingStopPayload,
  BrokerTrailingTakePayload,
  Exchange,
  IBroker,
  IStrategyPnL,
  listExchangeSchema,
} from "backtest-kit";
import { singleshot, trycatch } from "functools-kit";
import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";
import cli from "../lib";

const getBroker = singleshot(() => {
  const broker: IBroker = Broker["_brokerInstance"];
  if (!broker) {
    throw new Error("Broker instance is not initialized.");
  }
  return broker;
});

/** Called when a new signal is opened (position entry confirmed). */
const commitSignalOpen = trycatch(
  async (payload: BrokerSignalOpenPayload) => {
    const broker = getBroker();
    return await broker.onSignalOpenCommit(payload);
  },
  {
    fallback: (error) => {
      console.log(error);
      process.exit(-1);
    },
  },
);

/** Called when a new signal is closed (take-profit, stop-loss, or manual close). */
const commitSignalClose = trycatch(
  async (payload: BrokerSignalClosePayload) => {
    const broker = getBroker();
    return await broker.onSignalCloseCommit(payload);
  },
  {
    fallback: (error) => {
      console.log(error);
      process.exit(-1);
    },
  },
);

/** Called when a partial profit close is committed. */
const commitPartialProfit = trycatch(
  async (payload: BrokerPartialProfitPayload) => {
    const broker = getBroker();
    return await broker.onPartialProfitCommit(payload);
  },
  {
    fallback: (error) => {
      console.log(error);
      process.exit(-1);
    },
  },
);

/** Called when a partial loss close is committed. */
const commitPartialLoss = trycatch(
  async (payload: BrokerPartialLossPayload) => {
    const broker = getBroker();
    return await broker.onPartialLossCommit(payload);
  },
  {
    fallback: (error) => {
      console.log(error);
      process.exit(-1);
    },
  },
);

/** Called when a trailing stop update is committed. */
const commitTrailingStop = trycatch(
  async (payload: BrokerTrailingStopPayload) => {
    const broker = getBroker();
    return await broker.onTrailingStopCommit(payload);
  },
  {
    fallback: (error) => {
      console.log(error);
      process.exit(-1);
    },
  },
);

/** Called when a trailing take-profit update is committed. */
const commitTrailingTake = trycatch(
  async (payload: BrokerTrailingTakePayload) => {
    const broker = getBroker();
    return await broker.onTrailingTakeCommit(payload);
  },
  {
    fallback: (error) => {
      console.log(error);
      process.exit(-1);
    },
  },
);

/** Called when a breakeven stop is committed (stop loss moved to entry price). */
const commitBreakeven = trycatch(
  async (payload: BrokerBreakevenPayload) => {
    const broker = getBroker();
    return await broker.onBreakevenCommit(payload);
  },
  {
    fallback: (error) => {
      console.log(error);
      process.exit(-1);
    },
  },
);

/** Called when a DCA (average-buy) entry is committed. */
const commitAverageBuy = trycatch(
  async (payload: BrokerAverageBuyPayload) => {
    const broker = getBroker();
    return await broker.onAverageBuyCommit(payload);
  },
  {
    fallback: (error) => {
      console.log(error);
      process.exit(-1);
    },
  },
);

const COMMITS = [
  "signal-open",
  "signal-close",
  "partial-profit",
  "partial-loss",
  "average-buy",
  "trailing-stop",
  "trailing-take",
  "breakeven",
] as const;

type CommitName = (typeof COMMITS)[number];

const ZERO_PNL: IStrategyPnL = {
  pnlPercentage: 0,
  priceOpen: 0,
  priceClose: 0,
  pnlCost: 0,
  pnlEntries: 0,
};

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (!values.brokerdebug) {
    return;
  }

  await cli.moduleConnectionService.loadModule("./brokerdebug.module");

  const [defaultExchangeName = null] = await listExchangeSchema();

  const exchangeName =
    <string>values.exchange || defaultExchangeName?.exchangeName;
  const symbol = <string>values.symbol || "BTCUSDT";
  const commit = <CommitName>values.commit || "signal-open";

  if (!COMMITS.includes(commit)) {
    console.error(`Unknown --commit value: ${commit}`);
    console.error(`Available: ${COMMITS.join(", ")}`);
    process.exit(1);
  }

  const candles = await Exchange.getRawCandles(
    symbol,
    "1m",
    { exchangeName },
    5,
  );

  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastCandle.close;
  const priceTakeProfit = currentPrice * 1.02;
  const priceStopLoss = currentPrice * 0.98;

  const context = {
    strategyName: "broker-test" as any,
    exchangeName: exchangeName as any,
  };

  console.log(`symbol=${symbol} price=${currentPrice} commit=${commit}`);

  if (commit === "signal-open") {
    await commitSignalOpen({
      symbol,
      cost: 100,
      position: "long",
      priceOpen: currentPrice,
      priceTakeProfit,
      priceStopLoss,
      pnl: ZERO_PNL,
      peakProfit: ZERO_PNL,
      maxDrawdown: ZERO_PNL,
      context,
      backtest: true,
    });
  }

  if (commit === "signal-close") {
    await commitSignalClose({
      symbol,
      cost: 100,
      position: "long",
      currentPrice,
      priceOpen: currentPrice,
      priceTakeProfit,
      priceStopLoss,
      totalEntries: 1,
      totalPartials: 0,
      pnl: ZERO_PNL,
      peakProfit: ZERO_PNL,
      maxDrawdown: ZERO_PNL,
      context,
      backtest: true,
    });
  }

  if (commit === "partial-profit") {
    await commitPartialProfit({
      symbol,
      percentToClose: 50,
      cost: 50,
      currentPrice,
      position: "long",
      priceTakeProfit,
      priceStopLoss,
      context,
      backtest: true,
    });
  }

  if (commit === "partial-loss") {
    await commitPartialLoss({
      symbol,
      percentToClose: 50,
      cost: 50,
      currentPrice,
      position: "long",
      priceTakeProfit,
      priceStopLoss,
      context,
      backtest: true,
    });
  }

  if (commit === "average-buy") {
    await commitAverageBuy({
      symbol,
      currentPrice,
      cost: 100,
      position: "long",
      priceTakeProfit,
      priceStopLoss,
      context,
      backtest: true,
    });
  }

  if (commit === "trailing-stop") {
    await commitTrailingStop({
      symbol,
      percentShift: -50,
      currentPrice,
      newStopLossPrice: priceStopLoss + (currentPrice - priceStopLoss) * 0.5,
      takeProfitPrice: priceTakeProfit,
      position: "long",
      context,
      backtest: true,
    });
  }

  if (commit === "trailing-take") {
    await commitTrailingTake({
      symbol,
      percentShift: 50,
      currentPrice,
      newTakeProfitPrice:
        priceTakeProfit + (priceTakeProfit - currentPrice) * 0.5,
      takeProfitPrice: priceTakeProfit,
      position: "long",
      context,
      backtest: true,
    });
  }

  if (commit === "breakeven") {
    await commitBreakeven({
      symbol,
      currentPrice,
      newStopLossPrice: currentPrice,
      newTakeProfitPrice: priceTakeProfit,
      position: "long",
      context,
      backtest: true,
    });
  }

  console.log(`${commit} OK`);
  process.exit(0);
};

main();
