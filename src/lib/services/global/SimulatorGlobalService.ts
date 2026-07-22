import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import SimulatorConnectionService from "../connection/SimulatorConnectionService";
import { ISimulator, ISimulatorIdea, SimulatorName, ISimulatorGridPoint, ISimulatorAuthorStat } from "../../../interfaces/Simulator.interface";
import SimulatorValidationService from "../validation/SimulatorValidationService";

const METHOD_NAME_RUN = "simulatorGlobalService run";
const METHOD_NAME_TEST = "simulatorGlobalService test";

/**
 * Structural mirror of ISimulator: the global service exposes the
 * same public surface as the client it fronts, with DI-level DTOs.
 */
type TSimulator = {
  [key in keyof ISimulator]: any;
};

/**
 * Global entry point of the Simulator entity.
 *
 * The outermost service layer the public API talks to: validates the
 * referenced simulator (existence + exchange dependency) and
 * delegates to the connection layer, which owns the memoized
 * ClientSimulator instances.
 */
export class SimulatorGlobalService implements TSimulator {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  private readonly simulatorConnectionService = inject<SimulatorConnectionService>(
    TYPES.simulatorConnectionService
  );
  private readonly simulatorValidationService = inject<SimulatorValidationService>(TYPES.simulatorValidationService);

  /**
   * Runs the full simulation for a symbol after validating the
   * simulator reference: profiles -> author filter -> grid
   * evaluation -> rankings.
   *
   * @param dto.symbol - Trading pair symbol to simulate
   * @param dto.simulatorName - Registered simulator name
   * @param dto.ideas - Ideas feed (other symbols are filtered out by the client)
   * @returns Final simulation result (reports, rankings; the author artifact lives per-winner in best[])
   * @throws Error when the simulator or its exchange is not registered
   */
  public run = async (dto: {
    symbol: string;
    simulatorName: SimulatorName;
    ideas: ISimulatorIdea[];
  }) => {
    this.loggerService.log(METHOD_NAME_RUN, {
      simulatorName: dto.simulatorName,
      ideasLen: dto.ideas.length,
      symbol: dto.symbol,
    });
    this.simulatorValidationService.validate(dto.simulatorName, METHOD_NAME_RUN);
    return await this.simulatorConnectionService.run(dto);
  };

  /**
   * Out-of-sample test after validating the simulator reference:
   * evaluates one frozen grid point over fresh ideas with a frozen
   * author track record from a train run.
   *
   * @param dto.symbol - Trading pair symbol to test
   * @param dto.simulatorName - Registered simulator name
   * @param dto.ideas - Out-of-sample ideas feed (other symbols are filtered out by the client)
   * @param dto.point - Frozen grid point from the train run
   * @param dto.authorStats - Frozen author track record from the train run
   * @returns Out-of-sample result (point report, trades, frozen author artifact)
   * @throws Error when the simulator or its exchange is not registered
   */
  public test = async (dto: {
    symbol: string;
    simulatorName: SimulatorName;
    ideas: ISimulatorIdea[];
    point: ISimulatorGridPoint;
    authorStats: ISimulatorAuthorStat[];
  }) => {
    this.loggerService.log(METHOD_NAME_TEST, {
      simulatorName: dto.simulatorName,
      ideasLen: dto.ideas.length,
      symbol: dto.symbol,
      point: dto.point,
    });
    this.simulatorValidationService.validate(dto.simulatorName, METHOD_NAME_TEST);
    return await this.simulatorConnectionService.test(dto);
  };
}

export default SimulatorGlobalService;
