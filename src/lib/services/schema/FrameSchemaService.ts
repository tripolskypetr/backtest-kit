import { IFrameSchema, FrameName } from "../../../interfaces/Frame.interface";
import { ToolRegistry } from "functools-kit";

/**
 * Service for managing frame schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Frames are registered via addFrame() and retrieved by name.
 */
export class FrameSchemaService {
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
    this._registry.register(key, value);
  }

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
