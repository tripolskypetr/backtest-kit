import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { WorkerName, IWorkerSchema } from "../../../interfaces/Worker.interface";
import { memoize } from "functools-kit";
import StrategyValidationService from "./StrategyValidationService";
import ExchangeValidationService from "./ExchangeValidationService";
import FrameValidationService from "./FrameValidationService";

/**
 * Existence and dependency validation of worker instances.
 *
 * Tracks every registered worker and verifies at use time that a
 * referenced worker exists and its optional strategy, exchange and
 * frame dependencies are valid. Registration here is uniqueness-guarded,
 * unlike the schema registry where re-registering replaces the record.
 */
export class WorkerValidationService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private readonly strategyValidationService = inject<StrategyValidationService>(TYPES.strategyValidationService);

  private readonly exchangeValidationService = inject<ExchangeValidationService>(TYPES.exchangeValidationService);

  private readonly frameValidationService = inject<FrameValidationService>(TYPES.frameValidationService);

  private _workerMap = new Map<WorkerName, IWorkerSchema>();

  /**
   * Tracks a worker instance for validation. Called on schema
   * registration; duplicate names are rejected.
   *
   * @param workerName - Worker name to track
   * @param workerSchema - Schema stored for dependency checks
   * @throws Error when the name is already tracked
   */
  public addWorker = (workerName: WorkerName, workerSchema: IWorkerSchema): void => {
    this.loggerService.log("workerValidationService addWorker", {
      workerName,
      workerSchema,
    });
    if (this._workerMap.has(workerName)) {
      throw new Error(`worker ${workerName} already exist`);
    }
    this._workerMap.set(workerName, workerSchema);
  };

  /**
   * Validates that a worker instance is registered and its strategy,
   * exchange and frame dependencies pass validation. Memoized by
   * worker name — the check runs once per name, later calls are no-ops.
   *
   * @param workerName - Worker name to validate
   * @param source - Caller tag included in error messages
   * @throws Error when the worker or one of its dependencies is unknown
   */
  public validate = memoize(
    ([workerName]) => workerName,
    (workerName: WorkerName, source: string): void => {
      this.loggerService.log("workerValidationService validate", {
        workerName,
        source,
      });
      const worker = this._workerMap.get(workerName);
      if (!worker) {
        throw new Error(
          `worker ${workerName} not found source=${source}`
        );
      }

      if (worker.strategyName) {
        this.strategyValidationService.validate(worker.strategyName, source);
      }

      if (worker.exchangeName) {
        this.exchangeValidationService.validate(worker.exchangeName, source);
      }

      if ("frameName" in worker && worker.frameName) {
        this.frameValidationService.validate(worker.frameName, source);
      }

      return true as never;
    }
  ) as (workerName: WorkerName, source: string) => void;

  /**
   * Lists every tracked worker schema.
   *
   * @returns All schemas registered for validation
   */
  public list = async (): Promise<IWorkerSchema[]> => {
    this.loggerService.log("workerValidationService list");
    return Array.from(this._workerMap.values());
  };
}

export default WorkerValidationService;
