import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { FrameName, IFrameSchema } from "../../../interfaces/Frame.interface";
import { memoize } from "functools-kit";

/**
 * Service for managing and validating frame (timeframe) configurations.
 *
 * Maintains a registry of all configured frames and validates
 * their existence before operations. Uses memoization for performance.
 *
 * Key features:
 * - Registry management: addFrame() to register new timeframes
 * - Validation: validate() ensures frame exists before use
 * - Memoization: validation results are cached for performance
 * - Listing: list() returns all registered frames
 *
 * @throws {Error} If duplicate frame name is added
 * @throws {Error} If unknown frame is referenced
 *
 * @example
 * ```typescript
 * const frameValidation = new FrameValidationService();
 * frameValidation.addFrame("2024-Q1", frameSchema);
 * frameValidation.validate("2024-Q1", "backtest"); // OK
 * frameValidation.validate("unknown", "live"); // Throws error
 * ```
 */
export class FrameValidationService {
  /**
   * @private
   * @readonly
   * Injected logger service instance
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * @private
   * Map storing frame schemas by frame name
   */
  private _frameMap = new Map<FrameName, IFrameSchema>();

  /**
   * Adds a frame schema to the validation service
   * @public
   * @throws {Error} If frameName already exists
   */
  public addFrame = (frameName: FrameName, frameSchema: IFrameSchema): void => {
    this.loggerService.log("frameValidationService addFrame", {
      frameName,
      frameSchema,
    });
    if (this._frameMap.has(frameName)) {
      throw new Error(`frame ${frameName} already exist`);
    }
    this._frameMap.set(frameName, frameSchema);
  };

  /**
   * Validates the existence of a frame
   * @public
   * @throws {Error} If frameName is not found
   * Memoized function to cache validation results
   */
  public validate = memoize(
    ([frameName]) => frameName,
    (frameName: FrameName, source: string): void => {
      this.loggerService.log("frameValidationService validate", {
        frameName,
        source,
      });
      const frame = this._frameMap.get(frameName);
      if (!frame) {
        throw new Error(
          `frame ${frameName} not found source=${source}`
        );
      }
      return true as never;
    }
  ) as (frameName: FrameName, source: string) => void;

  /**
   * Returns a list of all registered frame schemas
   * @public
   * @returns Array of frame schemas with their configurations
   */
  public list = async (): Promise<IFrameSchema[]> => {
    this.loggerService.log("frameValidationService list");
    return Array.from(this._frameMap.values());
  };
}

/**
 * @exports FrameValidationService
 * Default export of FrameValidationService class
 */
export default FrameValidationService;
