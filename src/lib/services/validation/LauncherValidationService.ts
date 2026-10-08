import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { LauncherName, ILauncherSchema } from "../../../interfaces/Launcher.interface";
import { memoize } from "functools-kit";
import StrategyValidationService from "./StrategyValidationService";
import ExchangeValidationService from "./ExchangeValidationService";
import FrameValidationService from "./FrameValidationService";

/**
 * Existence and dependency validation of launcher instances.
 *
 * Tracks every registered launcher and verifies at use time that a
 * referenced launcher exists and its optional strategy, exchange and
 * frame dependencies are valid. Registration here is uniqueness-guarded,
 * unlike the schema registry where re-registering replaces the record.
 */
export class LauncherValidationService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private readonly strategyValidationService = inject<StrategyValidationService>(TYPES.strategyValidationService);

  private readonly exchangeValidationService = inject<ExchangeValidationService>(TYPES.exchangeValidationService);

  private readonly frameValidationService = inject<FrameValidationService>(TYPES.frameValidationService);

  private _launcherMap = new Map<LauncherName, ILauncherSchema>();

  /**
   * Tracks a launcher instance for validation. Called on schema
   * registration; duplicate names are rejected.
   *
   * @param launcherName - Launcher name to track
   * @param launcherSchema - Schema stored for dependency checks
   * @throws Error when the name is already tracked
   */
  public addLauncher = (launcherName: LauncherName, launcherSchema: ILauncherSchema): void => {
    this.loggerService.log("launcherValidationService addLauncher", {
      launcherName,
      launcherSchema,
    });
    if (this._launcherMap.has(launcherName)) {
      throw new Error(`launcher ${launcherName} already exist`);
    }
    this._launcherMap.set(launcherName, launcherSchema);
  };

  /**
   * Validates that a launcher instance is registered, its symbol list is
   * not empty and its strategy, exchange and frame dependencies pass
   * validation. Memoized by launcher name — the check runs once per name,
   * later calls are no-ops.
   *
   * @param launcherName - Launcher name to validate
   * @param source - Caller tag included in error messages
   * @throws Error when the launcher is unknown, its symbolList is empty or one of its dependencies is unknown
   */
  public validate = memoize(
    ([launcherName]) => launcherName,
    (launcherName: LauncherName, source: string): void => {
      this.loggerService.log("launcherValidationService validate", {
        launcherName,
        source,
      });
      const launcher = this._launcherMap.get(launcherName);
      if (!launcher) {
        throw new Error(
          `launcher ${launcherName} not found source=${source}`
        );
      }

      if (!launcher.symbolList.length) {
        throw new Error(
          `launcher ${launcherName} has an empty symbolList source=${source}`
        );
      }

      if (launcher.strategyName) {
        this.strategyValidationService.validate(launcher.strategyName, source);
      }

      if (launcher.exchangeName) {
        this.exchangeValidationService.validate(launcher.exchangeName, source);
      }

      if ("frameName" in launcher && launcher.frameName) {
        this.frameValidationService.validate(launcher.frameName, source);
      }

      return true as never;
    }
  ) as (launcherName: LauncherName, source: string) => void;

  /**
   * Lists every tracked launcher schema.
   *
   * @returns All schemas registered for validation
   */
  public list = async (): Promise<ILauncherSchema[]> => {
    this.loggerService.log("launcherValidationService list");
    return Array.from(this._launcherMap.values());
  };
}

export default LauncherValidationService;
