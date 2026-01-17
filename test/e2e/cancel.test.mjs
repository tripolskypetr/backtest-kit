import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  listenError,
  listenSchedulePing,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";
import { Subject, sleep } from "functools-kit";

