import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { SimulatorName, ISimulatorSchema } from "../../../interfaces/Simulator.interface";
import { memoize } from "functools-kit";
import ExchangeValidationService from "./ExchangeValidationService";

/**
 * Existence and dependency validation of simulators.
 *
 * Tracks every registered simulator and verifies at use time that a
 * referenced simulator exists and its exchange dependency is valid.
 * Registration here is uniqueness-guarded, unlike the schema
 * registry where re-registering replaces the record.
 */
export class SimulatorValidationService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private readonly exchangeValidationService = inject<ExchangeValidationService>(TYPES.exchangeValidationService);

  private _simulatorMap = new Map<SimulatorName, ISimulatorSchema>();

  /**
   * Tracks a simulator for validation. Called on schema
   * registration; duplicate names are rejected.
   *
   * @param simulatorName - Simulator name to track
   * @param simulatorSchema - Schema stored for dependency checks
   * @throws Error when the name is already tracked
   */
  public addSimulator = (simulatorName: SimulatorName, simulatorSchema: ISimulatorSchema): void => {
    this.loggerService.log("simulatorValidationService addSimulator", {
      simulatorName,
      simulatorSchema,
    });
    if (this._simulatorMap.has(simulatorName)) {
      throw new Error(`simulator ${simulatorName} already exist`);
    }
    this._simulatorMap.set(simulatorName, simulatorSchema);
  };

  /**
   * Validates that a simulator is registered and its exchange
   * dependency passes validation. Memoized by simulator name — the
   * check runs once per name, later calls are no-ops.
   *
   * @param simulatorName - Simulator name to validate
   * @param source - Caller tag included in error messages
   * @throws Error when the simulator or its exchange is unknown
   */
  public validate = memoize(
    ([simulatorName]) => simulatorName,
    (simulatorName: SimulatorName, source: string): void => {
      this.loggerService.log("simulatorValidationService validate", {
        simulatorName,
        source,
      });
      const simulator = this._simulatorMap.get(simulatorName);
      if (!simulator) {
        throw new Error(
          `simulator ${simulatorName} not found source=${source}`
        );
      }

      this.exchangeValidationService.validate(simulator.exchangeName, source);

      return true as never;
    }
  ) as (simulatorName: SimulatorName, source: string) => void;

  /**
   * Lists every tracked simulator schema.
   *
   * @returns All schemas registered for validation
   */
  public list = async (): Promise<ISimulatorSchema[]> => {
    this.loggerService.log("simulatorValidationService list");
    return Array.from(this._simulatorMap.values());
  };
}

export default SimulatorValidationService;
