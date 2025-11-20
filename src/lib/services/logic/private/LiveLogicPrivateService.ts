import { inject } from "../../../core/di";
import LoggerService from "../../base/LoggerService";
import TYPES from "../../../core/types";
import StrategyGlobalService from "../../global/StrategyGlobalService";
import { sleep } from "functools-kit";

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
  private readonly strategyGlobalService = inject<StrategyGlobalService>(
    TYPES.strategyGlobalService
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

    while (true) {
      const when = new Date();

      const result = await this.strategyGlobalService.tick(symbol, when, false);

      this.loggerService.info("liveLogicPrivateService tick result", {
        symbol,
        action: result.action,
      });

      if (result.action === "active") {
        await sleep(TICK_TTL);
        continue;
      }

      if (result.action === "idle") {
        await sleep(TICK_TTL);
        continue;
      }

      yield result;

      await sleep(TICK_TTL);
    }
  }
}

export default LiveLogicPrivateService;
