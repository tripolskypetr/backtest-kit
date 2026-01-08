import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import LiveLogicPrivateService from "../private/LiveLogicPrivateService";
import MethodContextService from "../../context/MethodContextService";
import { StrategyName } from "../../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../../interfaces/Exchange.interface";

/**
 * Type definition for public LiveLogic service.
 * Omits private dependencies from LiveLogicPrivateService.
 */
type ILiveLogicPrivateService = Omit<LiveLogicPrivateService, keyof {
  loggerService: never;
  strategyCoreService: never;
  methodContextService: never;
}>;

/**
 * Type definition for LiveLogicPublicService.
 * Maps all keys of ILiveLogicPrivateService to any type.
 */
type TLiveLogicPrivateService = {
  [key in keyof ILiveLogicPrivateService]: any;
};

/**
 * Public service for live trading orchestration with context management.
 *
 * Wraps LiveLogicPrivateService with MethodContextService to provide
 * implicit context propagation for strategyName and exchangeName.
 *
 * This allows getCandles(), getSignal(), and other functions to work without
 * explicit context parameters.
 *
 * Features:
 * - Infinite async generator (never completes)
 * - Crash recovery via persisted state
 * - Real-time progression with Date.now()
 *
 * @example
 * ```typescript
 * const liveLogicPublicService = inject(TYPES.liveLogicPublicService);
 *
 * // Infinite loop - use Ctrl+C to stop
 * for await (const result of liveLogicPublicService.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 * })) {
 *   if (result.action === "opened") {
 *     console.log("Signal opened:", result.signal);
 *   } else if (result.action === "closed") {
 *     console.log("PNL:", result.pnl.profit);
 *   }
 * }
 * ```
 */
export class LiveLogicPublicService implements TLiveLogicPrivateService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly liveLogicPrivateService = inject<LiveLogicPrivateService>(
    TYPES.liveLogicPrivateService
  );

  /**
   * Runs live trading for a symbol with context propagation.
   *
   * Streams opened and closed signals as infinite async generator.
   * Context is automatically injected into all framework functions.
   * Process can crash and restart - state will be recovered from disk.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy and exchange names
   * @returns Infinite async generator yielding opened and closed signals
   */
  public run = (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ) => {
    this.loggerService.log("liveLogicPublicService run", {
      symbol,
      context,
    });
    return MethodContextService.runAsyncIterator(
      this.liveLogicPrivateService.run(symbol),
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: "",
      }
    );
  };
}

export default LiveLogicPublicService;
