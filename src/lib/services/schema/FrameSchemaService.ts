import { IFrameSchema, FrameName } from "../../../interfaces/Frame.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";

/**
 * Service for managing frame schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Frames are registered via addFrame() and retrieved by name.
 */
export class FrameSchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

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
    this.loggerService.info(`frameSchemaService register`, { key });
    this.validateShallow(value);
    this._registry.register(key, value);
  }

  /**
   * Validates frame schema structure for required properties.
   *
   * Performs shallow validation to ensure all required properties exist
   * and have correct types before registration in the registry.
   *
   * @param frameSchema - Frame schema to validate
   * @throws Error if frameName is missing or not a string
   * @throws Error if interval is missing or not a valid FrameInterval
   * @throws Error if startDate is missing or not a Date
   * @throws Error if endDate is missing or not a Date
   */
  private validateShallow = (frameSchema: IFrameSchema) => {
    this.loggerService.info(`frameSchemaService validateShallow`, {
      frameSchema,
    });

    if (typeof frameSchema.frameName !== "string") {
      throw new Error(
        `frame schema validation failed: missing frameName`
      );
    }

    if (typeof frameSchema.interval !== "string") {
      throw new Error(
        `frame schema validation failed: missing interval for frameName=${frameSchema.frameName}`
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
    this._registry.override(key, value);
  }

  /**
   * Retrieves a frame schema by name.
   *
   * @param key - Frame name
   * @returns Frame schema configuration
   * @throws Error if frame name doesn't exist
   */
  public get(key: FrameName): IFrameSchema {
    return this._registry.get(key);
  }
}

export default FrameSchemaService;
