import { IFrameSchema, FrameName, FrameInterval } from "../../../interfaces/Frame.interface";
import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";

/** Interval a frame falls back to for both cadences when the schema names none */
const DEFAULT_INTERVAL: FrameInterval = "1m";

/**
 * Service for managing frame schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Frames are registered via addFrame() and retrieved by name.
 */
export class FrameSchemaService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<FrameName, IFrameSchema>>(
    "frameSchema"
  );

  /**
   * Registers a new frame schema.
   *
   * @param key - Unique frame name
   * @param value - Frame schema configuration
   * @throws Error if frame name already exists
   */
  public register(key: FrameName, value: IFrameSchema) {
    this.loggerService.log(`frameSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  }

  /**
   * Validates frame schema structure for required properties.
   *
   * Performs shallow validation to ensure all required properties exist
   * and have correct types before registration in the registry.
   *
   * @param frameSchema - Frame schema to validate
   * @throws Error if frameName is missing or not a string
   * @throws Error if interval, entryInterval or watchInterval is present but not a string
   * @throws Error if both interval and entryInterval are set (interval is an alias of entryInterval)
   * @throws Error if startDate is missing or not a Date
   * @throws Error if endDate is missing or not a Date
   */
  private validateShallow = (frameSchema: IFrameSchema) => {
    this.loggerService.log(`frameSchemaService validateShallow`, {
      frameSchema,
    });

    if (typeof frameSchema.frameName !== "string") {
      throw new Error(
        `frame schema validation failed: missing frameName`
      );
    }

    if (frameSchema.interval && typeof frameSchema.interval !== "string") {
      throw new Error(
        `frame schema validation failed: invalid interval for frameName=${frameSchema.frameName}`
      );
    }

    if (frameSchema.entryInterval && typeof frameSchema.entryInterval !== "string") {
      throw new Error(
        `frame schema validation failed: invalid entryInterval for frameName=${frameSchema.frameName}`
      );
    }

    if (frameSchema.watchInterval && typeof frameSchema.watchInterval !== "string") {
      throw new Error(
        `frame schema validation failed: invalid watchInterval for frameName=${frameSchema.frameName}`
      );
    }

    // `interval` is an alias of `entryInterval`: two names for one cadence would
    // leave the schema ambiguous when they disagree
    if (frameSchema.interval && frameSchema.entryInterval) {
      throw new Error(
        `frame schema validation failed: interval and entryInterval are both set for frameName=${frameSchema.frameName}; interval is an alias of entryInterval, keep one of them`
      );
    }

    if (!(frameSchema.startDate instanceof Date)) {
      throw new Error(
        `frame schema validation failed: missing startDate for frameName=${frameSchema.frameName}`
      );
    }

    if (!(frameSchema.endDate instanceof Date)) {
      throw new Error(
        `frame schema validation failed: missing endDate for frameName=${frameSchema.frameName}`
      );
    }
  };

  /**
   * Overrides an existing frame schema with partial updates.
   *
   * @param key - Frame name to override
   * @param value - Partial schema updates
   * @throws Error if frame name doesn't exist
   */
  public override(key: FrameName, value: Partial<IFrameSchema>) {
    this.loggerService.log(`frameSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  }

  /**
   * Tick interval of a frame: spacing of its timeframe array (how often
   * `getSignal` runs). Resolves `entryInterval`, then the `interval` alias,
   * then `"1m"`.
   *
   * @param key - Frame name
   * @returns The entry interval
   * @throws Error if frame name doesn't exist
   */
  public getEntryInterval(key: FrameName): FrameInterval {
    this.loggerService.log(`frameSchemaService getEntryInterval`, { key });
    const { entryInterval, interval } = this._registry.get(key);
    return entryInterval || interval || DEFAULT_INTERVAL;
  }

  /**
   * Watch interval of a frame: stride of the candle loops that re-evaluate an
   * open or scheduled signal. Resolves `watchInterval`, then `"1m"` (every
   * candle); it does NOT follow `interval` / `entryInterval`.
   *
   * @param key - Frame name
   * @returns The watch interval
   * @throws Error if frame name doesn't exist
   */
  public getWatchInterval(key: FrameName): FrameInterval {
    this.loggerService.log(`frameSchemaService getWatchInterval`, { key });
    const { watchInterval } = this._registry.get(key);
    return watchInterval || DEFAULT_INTERVAL;
  }

  /**
   * Retrieves a frame schema by name.
   *
   * @param key - Frame name
   * @returns Frame schema configuration
   * @throws Error if frame name doesn't exist
   */
  public get(key: FrameName): IFrameSchema {
    this.loggerService.log(`frameSchemaService get`, { key });
    return this._registry.get(key);
  }
}

export default FrameSchemaService;
