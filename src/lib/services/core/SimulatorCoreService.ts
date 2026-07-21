import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import SimulatorConnectionService from "../connection/SimulatorConnectionService";
import SimulatorValidationService from "../validation/SimulatorValidationService";
import { SimulatorName, ISimulator, ISimulatorIdea } from "../../../interfaces/Simulator.interface";

const METHOD_NAME_RUN = "simulatorCoreService run";

/**
 * Structural mirror of ISimulator: the core service exposes the same
 * public surface as the client it fronts, with DI-level DTOs.
 */
type TSimulator = {
  [key in keyof ISimulator]: any;
};

/**
 * Core layer of the Simulator entity.
 *
 * Validates the simulator reference (existence + exchange
 * dependency) and delegates to the connection layer. Sits between
 * the global entry point and the memoized ClientSimulator instances
 * owned by SimulatorConnectionService.
 */
export class SimulatorCoreService implements TSimulator {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  private readonly simulatorConnectionService = inject<SimulatorConnectionService>(
    TYPES.simulatorConnectionService
  );
  private readonly simulatorValidationService = inject<SimulatorValidationService>(
    TYPES.simulatorValidationService
  );

  /**
   * Runs the full simulation for a symbol after validating the
   * simulator reference: profiles -> author filter -> grid
   * evaluation -> rankings.
   *
   * @param dto.symbol - Trading pair symbol to simulate
   * @param dto.simulatorName - Registered simulator name
   * @param dto.ideas - Ideas feed (other symbols are filtered out by the client)
   * @returns Final simulation result (reports, rankings, author artifact)
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
}

export default SimulatorCoreService;
