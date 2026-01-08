import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import BacktestLogicPrivateService from "../private/BacktestLogicPrivateService";
import MethodContextService from "../../context/MethodContextService";
import { StrategyName } from "../../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../../interfaces/Exchange.interface";
import { FrameName } from "../../../../interfaces/Frame.interface";

/**
 * Type definition for public BacktestLogic service.
 * Omits private dependencies from BacktestLogicPrivateService.
 */
type IBacktestLogicPrivateService = Omit<BacktestLogicPrivateService, keyof {
  loggerService: never;
  strategyCoreService: never;
  exchangeCoreService: never;
  frameCoreService: never;
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
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly backtestLogicPrivateService =
    inject<BacktestLogicPrivateService>(TYPES.backtestLogicPrivateService);

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
  public run = (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    this.loggerService.log("backtestLogicPublicService run", {
      symbol,
      context,
    });
    return MethodContextService.runAsyncIterator(
      this.backtestLogicPrivateService.run(symbol),
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      }
    );
  };
}

export default BacktestLogicPublicService;
