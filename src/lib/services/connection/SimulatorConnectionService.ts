import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { SimulatorName, ISimulator, ISimulatorIdea, ISimulatorGridPoint, ISimulatorAuthorStat, ISimulatorGridAxes } from "../../../interfaces/Simulator.interface";
import { memoize } from "functools-kit";
import SimulatorSchemaService from "../schema/SimulatorSchemaService";
import { ClientSimulator } from "../../../client/ClientSimulator";

/**
 * Grid axes applied per-axis when the schema omits them (schema
 * gridAxes are merged over these defaults, so a schema may override
 * only the axes it cares about). Values are trading parameters, not
 * sentinels, and every rule dimension is actually SWEPT by default —
 * no axis is a degenerate single value that silently disables its
 * mechanism.
 *
 * Chosen from the empirical evidence of the reference runs:
 * - stops below ~2% sit inside the median whale shakeout (p25 of
 *   MAE-before-peak ≈ -2.7%) and kill future winners at entry;
 * - 0.5% trailing is 1m-noise level and never won a ranking;
 * - 72h/120h holds won nearly every ranking on real data, 24h was
 *   systematically too short for peaks that ripen for days;
 * - author QUALITY threshold (hit rate) mattered more than track
 *   length on every criterion — both are swept;
 * - Wilson lower bound: an alternative ban arithmetic that prices
 *   the track length into the quality estimate (3/3 newcomer ~0.44
 *   vs 15/15 veteran ~0.80 at the same observed rate); 0 keeps the
 *   pair-only baseline, 0.6 demands veteran-grade proof — the sweep
 *   decides which arithmetic wins;
 * - weighted consensus: 0 keeps the unweighted baseline in the
 *   sweep, 0.6 ~ a solo proven author (Laplace (hits+1)/(ideas+2)),
 *   1.2 ~ a pair — the sweep itself decides whether weighting helps;
 * - profit lock: covers the bleed zone below the trailing arm level
 *   (trailing arms only from peak >= entry/(1-r), so a +1.5..2.5%
 *   run that dumps gives everything back without a lock); 0 keeps
 *   the lock-free baseline, runners are untouched — above the lock
 *   the trailing floor is higher and fills first;
 * - author metric: "close" grades authors by horizon close (feeds
 *   long-hold points), "reach" by lock-reachability of their ideas
 *   (feeds lock points) — the sweep decides which grading wins;
 * - entry delay: the first-hour impulse of a posted idea retraces at
 *   30-120 minutes (measured on the reference feed: entries delayed
 *   by 30-60 minutes buy the local top and were the WORST of every
 *   delay tried), so the sweep offers the pullback entries at 4h and
 *   8h next to the instant baseline 0; the 15-60 minute range is
 *   deliberately absent;
 * - ban criteria (NOT a swept axis — run() aggregation config): all
 *   four ranking winners feed the run-level author artifact by
 *   default; a schema pins ["sharpe"] to restore the pre-union
 *   Sharpe-only artifact.
 */
const DEFAULT_GRID_AXES: ISimulatorGridAxes = {
  hardStopPercent: [1, 1.5, 2, 2.5, 3, 4, 5, 7],
  trailingTakePercent: [0.5, 1, 1.5, 2, 3, 4],
  holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
  minIdeasAligned: [1, 2, 3],
  minAuthorTrack: [2, 3, 5],
  minAuthorHitRate: [0.5, 0.6],
  minAuthorWilson: [0, 0.6],
  minWeightAligned: [0, 0.6, 1.2],
  profitLockPercent: [0, 1.5, 2.5],
  entryDelayMinutes: [0, 4 * 60, 8 * 60],
  authorMetric: ["close", "reach"],
  banCriteria: ["sharpe", "pnl"],
};

/**
 * Structural mirror of ISimulator: the connection service exposes the
 * same public surface as the client it manages, with DI-level DTOs.
 */
type TSimulator = {
    [key in keyof ISimulator]: any;
}

/**
 * Connection layer of the Simulator entity.
 *
 * Owns the ClientSimulator lifecycle: resolves the registered schema
 * by simulatorName, applies grid axes defaults, injects the logger
 * and memoizes one client instance per simulator name. Public
 * methods accept flat DTOs and delegate to the memoized client.
 */
export class SimulatorConnectionService implements TSimulator {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  private readonly simulatorSchemaService = inject<SimulatorSchemaService>(
    TYPES.simulatorSchemaService
  );

  /**
   * Returns the ClientSimulator for a simulator name, creating it on
   * first access. Memoized by simulator name — one client instance
   * per registered simulator; gridAxes fall back to
   * DEFAULT_GRID_AXES when the schema omits them.
   *
   * @param simulatorName - Registered simulator name
   * @returns Memoized ClientSimulator instance
   */
  public getSimulator = memoize(
    ([simulatorName]) => `${simulatorName}`,
    (simulatorName: SimulatorName) => {
      const { exchangeName, gridAxes, callbacks } =
        this.simulatorSchemaService.get(simulatorName);
      return new ClientSimulator({
        simulatorName,
        logger: this.loggerService,
        exchangeName,
        gridAxes: { ...DEFAULT_GRID_AXES, ...gridAxes },
        callbacks,
      });
    }
  );

  /**
   * Runs the full simulation for a symbol through the memoized
   * client: profiles -> author filter -> grid evaluation -> rankings.
   *
   * @param dto.symbol - Trading pair symbol to simulate
   * @param dto.simulatorName - Registered simulator name
   * @param dto.ideas - Ideas feed (other symbols are filtered out by the client)
   * @returns Final simulation result (reports, rankings; the author artifact lives per-winner in best[])
   */
  public run = async (dto: {
    symbol: string;
    simulatorName: SimulatorName;
    ideas: ISimulatorIdea[];
  }) => {
    this.loggerService.log("simulatorConnectionService run", {
        symbol: dto.symbol,
        simulatorName: dto.simulatorName,
        ideasLen: dto.ideas.length,
    });
    const instance = await this.getSimulator(dto.simulatorName);
    return await instance.run(dto.symbol, dto.ideas);
  }

  /**
   * Out-of-sample test through the memoized client: evaluates one
   * frozen grid point over fresh ideas with a frozen author track
   * record from a train run — nothing is trained on the test data.
   *
   * @param dto.symbol - Trading pair symbol to test
   * @param dto.simulatorName - Registered simulator name
   * @param dto.ideas - Out-of-sample ideas feed (other symbols are filtered out by the client)
   * @param dto.point - Frozen grid point from the train run
   * @param dto.authorStats - Frozen author track record from the train run
   * @returns Out-of-sample result (point report, trades, frozen author artifact)
   */
  public test = async (dto: {
    symbol: string;
    simulatorName: SimulatorName;
    ideas: ISimulatorIdea[];
    point: ISimulatorGridPoint;
    authorStats: ISimulatorAuthorStat[];
  }) => {
    this.loggerService.log("simulatorConnectionService test", {
        symbol: dto.symbol,
        simulatorName: dto.simulatorName,
        ideasLen: dto.ideas.length,
        point: dto.point,
    });
    const instance = await this.getSimulator(dto.simulatorName);
    return await instance.test(dto.symbol, dto.ideas, dto.point, dto.authorStats);
  }

  /**
   * Drops memoized client instances: a specific one by name or all
   * of them when called without arguments. The next getSimulator
   * call re-reads the schema and builds a fresh client.
   *
   * @param simulatorName - Simulator to drop; omit to drop all
   */
  public clear = (simulatorName?: SimulatorName) => {
    this.loggerService.log("simulatorConnectionService clear", {
      simulatorName,
    });
    if (simulatorName === undefined) {
      this.getSimulator.clear();
      return;
    }
    this.getSimulator.clear(`${simulatorName}`);
  };
}

export default SimulatorConnectionService;
