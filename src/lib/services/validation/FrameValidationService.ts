import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { FrameName, IFrameSchema } from "../../../interfaces/Frame.interface";
import { memoize } from "functools-kit";

/**
 * @class FrameValidationService
 * Service for managing and validating frame configurations
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
}

/**
 * @exports FrameValidationService
 * Default export of FrameValidationService class
 */
export default FrameValidationService;
