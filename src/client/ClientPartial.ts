import {
  IPartialState,
  PartialLevel,
  IPartialParams,
  IPartialData,
} from "../interfaces/Partial.interface";
import { ISignalRow } from "../interfaces/Strategy.interface";
import { PersistPartialAdapter } from "../classes/Persist";
import { singleshot } from "functools-kit";

const NEED_FETCH = Symbol("need_fetch");
const PROFIT_LEVELS: PartialLevel[] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const LOSS_LEVELS: PartialLevel[] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const HANDLE_PROFIT_FN = async (
  symbol: string,
  data: ISignalRow,
  currentPrice: number,
  revenuePercent: number,
  backtest: boolean,
  when: Date,
  self: ClientPartial
) => {
  if (self._states === NEED_FETCH) {
    throw new Error(
      "ClientPartial not initialized. Call waitForInit() before using."
    );
  }

  let state = self._states.get(data.id);
  if (!state) {
    state = {
      profitLevels: new Set(),
      lossLevels: new Set(),
    };
    self._states.set(data.id, state);
  }

  let shouldPersist = false;

  for (const level of PROFIT_LEVELS) {
    if (revenuePercent >= level && !state.profitLevels.has(level)) {
      state.profitLevels.add(level);
      shouldPersist = true;

      self.params.logger.debug("ClientPartial profit level reached", {
        symbol,
        signalId: data.id,
        level,
        revenuePercent,
        backtest,
      });

      await self.params.onProfit(symbol, data, currentPrice, level, backtest, when.getTime());
    }
  }

  if (shouldPersist) {
    await self._persistState(symbol);
  }
};

const HANDLE_LOSS_FN = async (
  symbol: string,
  data: ISignalRow,
  currentPrice: number,
  lossPercent: number,
  backtest: boolean,
  when: Date,
  self: ClientPartial
) => {
  if (self._states === NEED_FETCH) {
    throw new Error(
      "ClientPartial not initialized. Call waitForInit() before using."
    );
  }

  let state = self._states.get(data.id);
  if (!state) {
    state = {
      profitLevels: new Set(),
      lossLevels: new Set(),
    };
    self._states.set(data.id, state);
  }

  const absLoss = Math.abs(lossPercent);
  let shouldPersist = false;

  for (const level of LOSS_LEVELS) {
    if (absLoss >= level && !state.lossLevels.has(level)) {
      state.lossLevels.add(level);
      shouldPersist = true;

      self.params.logger.debug("ClientPartial loss level reached", {
        symbol,
        signalId: data.id,
        level,
        lossPercent,
        backtest,
      });

      await self.params.onLoss(symbol, data, currentPrice, level, backtest, when.getTime());
    }
  }

  if (shouldPersist) {
    await self._persistState(symbol);
  }
};

const WAIT_FOR_INIT_FN = async (symbol: string, self: ClientPartial) => {
  self.params.logger.debug("ClientPartial waitForInit", { symbol });

  if (self._states === NEED_FETCH) {
    throw new Error(
      "ClientPartial not initialized. Call waitForInit() before using."
    );
  }

  const partialData = await PersistPartialAdapter.readPartialData(symbol);

  for (const [signalId, data] of Object.entries(partialData)) {
    const state: IPartialState = {
      profitLevels: new Set(data.profitLevels),
      lossLevels: new Set(data.lossLevels),
    };
    self._states.set(signalId, state);
  }

  self.params.logger.info("ClientPartial restored state", {
    symbol,
    signalCount: Object.keys(partialData).length,
  });
};

export class ClientPartial {
  _states: Map<string, IPartialState> | typeof NEED_FETCH = NEED_FETCH;

  constructor(readonly params: IPartialParams) {
    this._states = new Map();
  }

  public waitForInit = singleshot(
    async (symbol: string) => await WAIT_FOR_INIT_FN(symbol, this)
  );

  public async _persistState(symbol: string): Promise<void> {
    this.params.logger.debug("ClientPartial persistState", { symbol });
    if (this._states === NEED_FETCH) {
      throw new Error(
        "ClientPartial not initialized. Call waitForInit() before using."
      );
    }
    const partialData: Record<string, IPartialData> = {};
    for (const [signalId, state] of this._states.entries()) {
      partialData[signalId] = {
        profitLevels: Array.from(state.profitLevels),
        lossLevels: Array.from(state.lossLevels),
      };
    }
    await PersistPartialAdapter.writePartialData(partialData, symbol);
  }

  public async setStateMap(
    symbol: string,
    states: Map<string, IPartialState>
  ): Promise<void> {
    this.params.logger.info("ClientPartial setStateMap", {
      symbol,
      stateCount: states.size,
    });
    this._states = states;
    await this._persistState(symbol);
  }

  public async profit(
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    revenuePercent: number,
    backtest: boolean,
    when: Date
  ) {
    this.params.logger.debug("ClientPartial profit", {
      symbol,
      signalId: data.id,
      currentPrice,
      revenuePercent,
      backtest,
      when,
    });
    return await HANDLE_PROFIT_FN(
      symbol,
      data,
      currentPrice,
      revenuePercent,
      backtest,
      when,
      this
    );
  }

  public async loss(
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    lossPercent: number,
    backtest: boolean,
    when: Date
  ) {
    this.params.logger.debug("ClientPartial loss", {
      symbol,
      signalId: data.id,
      currentPrice,
      lossPercent,
      backtest,
      when,
    });
    return await HANDLE_LOSS_FN(symbol, data, currentPrice, lossPercent, backtest, when, this);
  }

  public async clear(symbol: string, data: ISignalRow, priceClose: number) {
    this.params.logger.log("ClientPartial clear", {
      symbol,
      data,
      priceClose,
    });
    if (this._states === NEED_FETCH) {
      throw new Error(
        "ClientPartial not initialized. Call waitForInit() before using."
      );
    }
    this._states.delete(data.id);
    await this._persistState(symbol);
  }
}

export default ClientPartial;
