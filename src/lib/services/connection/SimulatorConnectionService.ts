import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { SimulatorName, ISimulator, ISimulatorIdea } from "../../../interfaces/Simulator.interface";
import { memoize } from "functools-kit";
import SimulatorSchemaService from "../schema/SimulatorSchemaService";
import { ClientSimulator } from "../../../client/ClientSimulator";

/**
 * Grid axes applied when the schema does not override gridAxes.
 * Values are trading parameters, not sentinels: hold durations are
 * bounded (no "hold forever" option), stop/trailing levels are
 * realistic — a schema wanting exotic axes overrides them explicitly.
 */
const DEFAULT_GRID_AXES = {
  hardStopPercent: [1, 1.5, 2, 2.5, 3, 4, 5, 7],
  trailingTakePercent: [0.5, 1, 1.5, 2, 3, 4],
  holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
  minIdeasAligned: [1, 2, 3],
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
      const { exchangeName, gridAxes = DEFAULT_GRID_AXES, callbacks } =
        this.simulatorSchemaService.get(simulatorName);
      return new ClientSimulator({
        simulatorName,
        logger: this.loggerService,
        exchangeName,
        gridAxes,
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
   * @returns Final simulation result (reports, rankings, author artifact)
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
