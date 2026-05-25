import { inject } from "../../../core/di";
import { TLoggerService } from "../../base/LoggerService";
import TYPES from "../../../core/types";
import BacktestLogicPrivateService from "../private/BacktestLogicPrivateService";
import MethodContextService from "../../context/MethodContextService";
import { StrategyName } from "../../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../../interfaces/Exchange.interface";
import { FrameName } from "../../../../interfaces/Frame.interface";
import { errorData, getErrorMessage, trycatch } from "functools-kit";
import ExecutionContextService from "../../context/ExecutionContextService";
import { afterEndSubject, beforeStartSubject, errorEmitter } from "../../../../config/emitters";
import TimeMetaService from "../../meta/TimeMetaService";
import FrameSchemaService from "../../schema/FrameSchemaService";
import alignToInterval from "../../../../utils/alignToInterval";

/**
 * Type definition for public BacktestLogic service.
 * Omits private dependencies from BacktestLogicPrivateService.
 */
type IBacktestLogicPrivateService = Omit<BacktestLogicPrivateService, keyof {
  loggerService: never;
  strategyCoreService: never;
  exchangeCoreService: never;
  frameCoreService: never;
  actionCoreService: never;
  methodContextService: never;
}>;

/**
 * Type definition for BacktestLogicPublicService.
 * Maps all keys of IBacktestLogicPrivateService to any type.
 */
type TBacktestLogicPrivateService = {
  [key in keyof IBacktestLogicPrivateService]: any;
};

/**
 * Run iterator function for backtest logic.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param context - Execution context with strategy, exchange, and frame names
 * @param self - Instance of BacktestLogicPublicService
 * @returns Async iterator for backtest results
 */
const RUN_ITERATOR_FN = (
  self: BacktestLogicPublicService,
  symbol: string,
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName: FrameName;
  },
) => {
  return MethodContextService.runAsyncIterator(
    self.backtestLogicPrivateService.run(symbol),
    {
      exchangeName: context.exchangeName,
      strategyName: context.strategyName,
      frameName: context.frameName,
    }
  );
}

/**
 * Call before start execution for backtest logic.
 * This function is responsible for triggering the beforeStartSubject
 * with the appropriate context and symbol information.
 */
const CALL_BEFORE_START_FN = trycatch(
  async (
    self: BacktestLogicPublicService,
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
  ) => {
    const { startDate } = self.frameSchemaService.get(context.frameName);
    const when = alignToInterval(startDate, "1m");
    await MethodContextService.runInContext(async () => {
      await ExecutionContextService.runInContext(async () => {
        await beforeStartSubject.next({
          symbol,
          exchangeName: context.exchangeName,
          strategyName: context.strategyName,
          frameName: context.frameName,
          backtest: true,
        });
      }, {
        symbol,
        when,
        backtest: true,
      });
    }, {
      exchangeName: context.exchangeName,
      strategyName: context.strategyName,
      frameName: context.frameName,
    });
  }, {
    fallback: (error, self) => {
      const message = "BacktestLogicPublicService CALL_BEFORE_START_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.loggerService.warn(message, payload);
      console.error(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Call after end execution for backtest logic.
 * This function is responsible for triggering the afterEndSubject
 * with the appropriate context and symbol information.
 */
const CALL_AFTER_END_FN = trycatch(
  async (
    self: BacktestLogicPublicService,
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
  ) => {
    const { startDate } = self.frameSchemaService.get(context.frameName);
    const timestamp = self.timeMetaService.hasTimestamp(symbol, context, true)
      ? await self.timeMetaService.getTimestamp(symbol, context, true)
      : startDate.getTime();
    const when = new Date(timestamp);
    await MethodContextService.runInContext(async () => {
      await ExecutionContextService.runInContext(async () => {
        await afterEndSubject.next({
          symbol,
          exchangeName: context.exchangeName,
          strategyName: context.strategyName,
          frameName: context.frameName,
          backtest: true,
        });
      }, {
        symbol,
        when,
        backtest: true,
      });
    }, {
      exchangeName: context.exchangeName,
      strategyName: context.strategyName,
      frameName: context.frameName,
    });
  }, {
    fallback: (error, self) => {
      const message = "BacktestLogicPublicService CALL_AFTER_END_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.loggerService.warn(message, payload);
      console.error(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Public service for backtest orchestration with context management.
 *
 * Wraps BacktestLogicPrivateService with MethodContextService to provide
 * implicit context propagation for strategyName, exchangeName, and frameName.
 *
 * This allows getCandles(), getSignal(), and other functions to work without
 * explicit context parameters.
 *
 * @example
 * ```typescript
 * const backtestLogicPublicService = inject(TYPES.backtestLogicPublicService);
 *
 * for await (const result of backtestLogicPublicService.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: "1d-backtest",
 * })) {
 *   if (result.action === "closed") {
 *     console.log("PNL:", result.pnl.profit);
 *   }
 * }
 * ```
 */
export class BacktestLogicPublicService implements TBacktestLogicPrivateService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  readonly backtestLogicPrivateService =
    inject<BacktestLogicPrivateService>(TYPES.backtestLogicPrivateService);
  readonly timeMetaService = inject<TimeMetaService>(TYPES.timeMetaService);
  readonly frameSchemaService = inject<FrameSchemaService>(TYPES.frameSchemaService);

  /**
   * Runs backtest for a symbol with context propagation.
   *
   * Streams closed signals as async generator. Context is automatically
   * injected into all framework functions called during iteration.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy, exchange, and frame names
   * @returns Async generator yielding closed signals with PNL
   */
  public async *run(
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) {
    this.loggerService.log("backtestLogicPublicService run", {
      symbol,
      context,
    });
    await CALL_BEFORE_START_FN(this, symbol, context);
    try {
      yield* RUN_ITERATOR_FN(this, symbol, context);
    } finally {
      await CALL_AFTER_END_FN(this, symbol, context);
    }
  }
}

export default BacktestLogicPublicService;
