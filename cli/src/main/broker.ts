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
  IBroker,
} from "backtest-kit";
import { singleshot } from "functools-kit";
import getEntry from "../helpers/getEntry";

const getBroker = singleshot(() => {
  const broker: IBroker = Broker["_brokerInstance"];
  if (!broker) {
    throw new Error("Broker instance is not initialized.");
  }
  return broker;
});

/** Called when a new signal is opened (position entry confirmed). */
const commitSignalOpen = async (payload: BrokerSignalOpenPayload) => {
  const broker = getBroker();
  return await broker.onSignalOpenCommit(payload);
};

/** Called when a new signal is closed (take-profit, stop-loss, or manual close). */
const commitSignalClose = async (payload: BrokerSignalClosePayload) => {
  const broker = getBroker();
  return await broker.onSignalCloseCommit(payload);
};

/** Called when a partial profit close is committed. */
const commitPartialProfit = async (payload: BrokerPartialProfitPayload) => {
  const broker = getBroker();
  return await broker.onPartialProfitCommit(payload);
};

/** Called when a partial loss close is committed. */
const commitPartialLoss = async (payload: BrokerPartialLossPayload) => {
    const broker = getBroker();
    return await broker.onPartialLossCommit(payload);
}

/** Called when a trailing stop update is committed. */
const commitTrailingStop = async (payload: BrokerTrailingStopPayload) => {
    const broker = getBroker();
    return await broker.onTrailingStopCommit(payload)
}

/** Called when a trailing take-profit update is committed. */
const commitTrailingTake = async (payload: BrokerTrailingTakePayload) => {
    const broker = getBroker();
    return await broker.onTrailingTakeCommit(payload);
}

/** Called when a breakeven stop is committed (stop loss moved to entry price). */
const commitBreakeven = async (payload: BrokerBreakevenPayload) => {
    const broker = getBroker();
    return await broker.onBreakevenCommit(payload);
}

/** Called when a DCA (average-buy) entry is committed. */
const commitAverageBuy = async (payload: BrokerAverageBuyPayload) => {
    const broker = getBroker();
    return await broker.onAverageBuyCommit(payload);
}

export const main = async () => {
    if (!getEntry(import.meta.url)) {
        return;
    }
}

main();
