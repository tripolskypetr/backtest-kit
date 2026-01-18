import {
  ActionName,
  IActionSchema,
  IPublicAction,
  TActionCtor,
} from "../../../interfaces/Action.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { isObject, str, ToolRegistry } from "functools-kit";

type Key = keyof IPublicAction;

const VALID_METHOD_NAMES: Key[] = [
  "init",
  "signal",
  "signalLive",
  "signalBacktest",
  "breakevenAvailable",
  "partialProfitAvailable",
  "partialLossAvailable",
  "pingScheduled",
  "pingActive",
  "riskRejection",
  "dispose",
];

const VALIDATE_CLASS_METHODS = (
  actionName: ActionName,
  handler: TActionCtor,
  self: ActionSchemaService,
) => {
  // Get all method names from prototype (for classes)
  const prototypeProps = Object.getOwnPropertyNames(handler.prototype);

  for (const methodName of prototypeProps) {
    if (methodName === "constructor" || methodName.startsWith("_")) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      handler.prototype,
      methodName,
    );
    const isMethod = descriptor && typeof descriptor.value === "function";

    if (isMethod && !VALID_METHOD_NAMES.includes(<Key>methodName)) {
      const msg = str.newline(
        `ActionSchema ${actionName} contains invalid method "${methodName}". `,
        `Valid methods are: ${VALID_METHOD_NAMES.join(", ")}`,
        `If you want to keep this property name it following the next patterm: _${methodName}`,
      );
      self.loggerService.log(`actionValidationService exception thrown`, {
        msg,
      });
      throw new Error(msg);
    }
  }
};

const VALIDATE_OBJECT_METHODS = (
  actionName: ActionName,
  handler: Partial<IPublicAction>,
  self: ActionSchemaService,
) => {
  // For plain objects (Partial<IPublicAction>)
  const methodNames = Object.keys(handler);

  for (const methodName of methodNames) {
    // Skip private properties (starting with _)
    if (methodName.startsWith("_")) {
      continue;
    }

    if (
      typeof handler[methodName] === "function" &&
      !VALID_METHOD_NAMES.includes(<Key>methodName)
    ) {
      const msg = str.newline(
        `ActionSchema ${actionName} contains invalid method "${methodName}". `,
        `Valid methods are: ${VALID_METHOD_NAMES.join(", ")}`,
        `If you want to keep this property name it following the next patterm: _${methodName}`,
      );
      self.loggerService.log(`actionValidationService exception thrown`, {
        msg,
      });
      throw new Error(msg);
    }
  }
};

/**
 * Service for managing action schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Action handlers are registered via addAction() and retrieved by name.
 */
export class ActionSchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<ActionName, IActionSchema>>(
    "actionSchema",
  );

  /**
   * Registers a new action schema.
   *
   * @param key - Unique action name
   * @param value - Action schema configuration
   * @throws Error if action name already exists
   */
  public register = (key: ActionName, value: IActionSchema) => {
    this.loggerService.log(`actionSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  };

  /**
   * Validates action schema structure for required properties.
   *
   * Performs shallow validation to ensure all required properties exist
   * and have correct types before registration in the registry.
   *
   * @param actionSchema - Action schema to validate
   * @throws Error if actionName is missing or not a string
   * @throws Error if handler is missing or not a function
   * @throws Error if callbacks is not an object
   */
  private validateShallow = (actionSchema: IActionSchema) => {
    this.loggerService.log(`actionSchemaService validateShallow`, {
      actionSchema,
    });
    if (typeof actionSchema.actionName !== "string") {
      throw new Error(`action schema validation failed: missing actionName`);
    }
    if (
      typeof actionSchema.handler !== "function" &&
      !isObject(actionSchema.handler)
    ) {
      throw new Error(
        `action schema validation failed: handler is not a function or plain object for actionName=${actionSchema.actionName}`,
      );
    }
    if (typeof actionSchema.handler === "function" && actionSchema.handler.prototype) {
      VALIDATE_CLASS_METHODS(actionSchema.actionName, actionSchema.handler, this);
    }
    if (typeof actionSchema.handler === "object" && actionSchema.handler !== null) {
      VALIDATE_OBJECT_METHODS(actionSchema.actionName, actionSchema.handler, this);
    }
    if (actionSchema.callbacks && !isObject(actionSchema.callbacks)) {
      throw new Error(
        `action schema validation failed: callbacks is not an object for actionName=${actionSchema.actionName}`,
      );
    }
  };

  /**
   * Overrides an existing action schema with partial updates.
   *
   * @param key - Action name to override
   * @param value - Partial schema updates
   * @returns Updated action schema
   * @throws Error if action name doesn't exist
   */
  public override = (key: ActionName, value: Partial<IActionSchema>) => {
    this.loggerService.log(`actionSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  };

  /**
   * Retrieves an action schema by name.
   *
   * @param key - Action name
   * @returns Action schema configuration
   * @throws Error if action name doesn't exist
   */
  public get = (key: ActionName): IActionSchema => {
    this.loggerService.log(`actionSchemaService get`, { key });
    return this._registry.get(key);
  };
}

export default ActionSchemaService;
