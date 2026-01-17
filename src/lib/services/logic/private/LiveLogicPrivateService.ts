import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import StrategyCoreService from "../../core/StrategyCoreService";
import { and, errorData, getErrorMessage, sleep } from "functools-kit";
import { performanceEmitter, errorEmitter } from "../../../../config/emitters";
import { TMethodContextService } from "../../context/MethodContextService";
import {
  IStrategyTickResult,
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  IStrategyTickResultCancelled,
} from "../../../../interfaces/Strategy.interface";

const TICK_TTL = 1 * 60 * 1_000 + 1;

/**
 * Private service for live trading orchestration using async generators.
 *
 * Flow:
 * 1. Infinite while(true) loop for continuous monitoring
 * 2. Create real-time date with new Date()
 * 3. Call tick() to check signal status
 * 4. Yield opened/closed results (skip idle/active)
 * 5. Sleep for TICK_TTL between iterations
 *
 * Features:
 * - Crash recovery via ClientStrategy.waitForInit()
 * - Real-time progression with new Date()
 * - Memory efficient streaming
 * - Never completes (infinite generator)
 */
export class LiveLogicPrivateService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly strategyCoreService = inject<StrategyCoreService>(
    TYPES.strategyCoreService
  );
  private readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );

  /**
   * Runs live trading for a symbol, streaming results as async generator.
   *
   * Infinite generator that yields opened and closed signals.
   * Process can crash and restart - state will be recovered from disk.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @yields Opened and closed signal results
   *
   * @example
   * ```typescript
   * for await (const result of liveLogic.run("BTCUSDT")) {
   *   if (result.action === "opened") {
   *     console.log("New signal:", result.signal.id);
   *   }
   *   if (result.action === "closed") {
   *     console.log("PNL:", result.pnl.pnlPercentage);
   *   }
   *   // Infinite loop - will never complete
   * }
   * ```
   */
  public async *run(symbol: string) {
    this.loggerService.log("liveLogicPrivateService run", {
      symbol,
    });

    let previousEventTimestamp: number | null = null;

    while (true) {
      const tickStartTime = performance.now();
      const when = new Date();

      let result: IStrategyTickResult;
      try {
        result = await this.strategyCoreService.tick(symbol, when, false, {
          strategyName: this.methodContextService.context.strategyName,
          exchangeName: this.methodContextService.context.exchangeName,
          frameName: this.methodContextService.context.frameName,
        });
      } catch (error) {
        console.warn(
          `backtestLogicPrivateService tick failed when=${when.toISOString()} symbol=${symbol} strategyName=${
            this.methodContextService.context.strategyName
          } exchangeName=${this.methodContextService.context.exchangeName}`
        );
        this.loggerService.warn(
          "liveLogicPrivateService tick failed, retrying after sleep",
          {
            symbol,
            when: when.toISOString(),
            error: errorData(error),
            message: getErrorMessage(error),
          }
        );
        await errorEmitter.next(error);
        await sleep(TICK_TTL);
        continue;
      }

      this.loggerService.info("liveLogicPrivateService tick result", {
        symbol,
        action: result.action,
      });

      // Track tick duration
      const tickEndTime = performance.now();
      const currentTimestamp = Date.now();
      await performanceEmitter.next({
        timestamp: currentTimestamp,
        previousTimestamp: previousEventTimestamp,
        metricType: "live_tick",
        duration: tickEndTime - tickStartTime,
        strategyName: this.methodContextService.context.strategyName,
        exchangeName: this.methodContextService.context.exchangeName,
        frameName: this.methodContextService.context.frameName,
        symbol,
        backtest: false,
      });
      previousEventTimestamp = currentTimestamp;

      // Check if strategy should stop when idle (no active signal)
      if (result.action === "idle") {
        if (
          await and(
            Promise.resolve(true),
            this.strategyCoreService.getStopped(
              false,
              symbol,
              {
                strategyName: this.methodContextService.context.strategyName,
                exchangeName: this.methodContextService.context.exchangeName,
                frameName: this.methodContextService.context.frameName,
              }
            )
          )
        ) {
          this.loggerService.info(
            "liveLogicPrivateService stopped by user request (idle state)",
            {
              symbol,
              when: when.toISOString(),
            }
          );
          break;
        }
        await sleep(TICK_TTL);
        continue;
      }

      if (result.action === "active") {
        await sleep(TICK_TTL);
        continue;
      }

      if (result.action === "scheduled") {
        await sleep(TICK_TTL);
        continue;
      }

      if (result.action === "waiting") {
        await sleep(TICK_TTL);
        continue;
      }

      // Yield opened, closed, cancelled results
      yield result as IStrategyTickResultClosed | IStrategyTickResultOpened | IStrategyTickResultCancelled;

      // Check if strategy should stop after signal is closed
      if (result.action === "closed") {
        if (
          await this.strategyCoreService.getStopped(
            false,
            symbol,
            {
              strategyName: this.methodContextService.context.strategyName,
              exchangeName: this.methodContextService.context.exchangeName,
              frameName: this.methodContextService.context.frameName,
            }
          )
        ) {
          this.loggerService.info(
            "liveLogicPrivateService stopped by user request (after signal closed)",
            {
              symbol,
              signalId: result.signal.id,
            }
          );
          break;
        }
      }

      await sleep(TICK_TTL);
    }
  }
}

export default LiveLogicPrivateService;
