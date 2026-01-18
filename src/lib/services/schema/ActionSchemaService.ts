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

/**
 * Type alias for valid public action method names.
 * Used to enforce type safety in validation functions.
 */
type Key = keyof IPublicAction;

/**
 * List of valid method names allowed in action handlers.
 * Any public methods not in this list will trigger validation errors.
 * Private methods (starting with _ or #) are ignored during validation.
 */
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

/**
 * Calculates the Levenshtein distance between two strings.
 *
 * Levenshtein distance is the minimum number of single-character edits
 * (insertions, deletions, or substitutions) required to change one string into another.
 * Used to find typos and similar method names in validation.
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns Number of edits needed to transform str1 into str2
 */
const LEVENSHTEIN_DISTANCE = (str1: string, str2: string): number => {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create a 2D array for dynamic programming
  const matrix: number[][] = Array.from({ length: len1 + 1 }, () =>
    Array(len2 + 1).fill(0)
  );

  // Initialize first column and row
  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
};

/**
 * Finds suggestions for a method name based on similarity scoring.
 *
 * Uses Levenshtein distance and partial string matching to find similar method names.
 * Returns suggestions sorted by similarity (most similar first).
 * Used to provide helpful "Did you mean?" suggestions in validation error messages.
 *
 * @param methodName - The invalid method name to find suggestions for
 * @param validNames - List of valid method names to search through
 * @param maxDistance - Maximum Levenshtein distance to consider (default: 3)
 * @returns Array of suggested method names sorted by similarity
 */
const FIND_SUGGESTIONS = (
  methodName: string,
  validNames: readonly string[],
  maxDistance: number = 3,
): string[] => {
  const lowerMethodName = methodName.toLowerCase();

  // Calculate similarity score for each valid name
  const suggestions = validNames
    .map((validName) => {
      const lowerValidName = validName.toLowerCase();
      const distance = LEVENSHTEIN_DISTANCE(lowerMethodName, lowerValidName);

      // Check for partial matches
      const hasPartialMatch =
        lowerValidName.includes(lowerMethodName) ||
        lowerMethodName.includes(lowerValidName);

      return {
        name: validName,
        distance,
        hasPartialMatch,
      };
    })
    .filter(
      (item) =>
        item.distance <= maxDistance || item.hasPartialMatch
    )
    .sort((a, b) => {
      // Prioritize partial matches
      if (a.hasPartialMatch && !b.hasPartialMatch) return -1;
      if (!a.hasPartialMatch && b.hasPartialMatch) return 1;
      // Then sort by distance
      return a.distance - b.distance;
    })
    .slice(0, 3) // Limit to top 3 suggestions
    .map((item) => item.name);

  return suggestions;
};

/**
 * Validates that all public methods in a class-based action handler are in the allowed list.
 *
 * Inspects the class prototype to find all method names and ensures they match
 * the VALID_METHOD_NAMES list. Private methods (starting with _ or #) are skipped.
 * Private fields with # are not visible via Object.getOwnPropertyNames() and don't
 * need validation as they're truly private and inaccessible.
 *
 * @param actionName - Name of the action being validated
 * @param handler - Class constructor for the action handler
 * @param self - ActionSchemaService instance for logging
 * @throws Error if any public method is not in VALID_METHOD_NAMES
 */
const VALIDATE_CLASS_METHODS = (
  actionName: ActionName,
  handler: TActionCtor,
  self: ActionSchemaService,
) => {
  // Get all method names from prototype (for classes)
  // Note: Private fields with # are not visible via Object.getOwnPropertyNames()
  // and don't need validation as they're truly private and inaccessible
  const prototypeProps = Object.getOwnPropertyNames(handler.prototype);

  for (const methodName of prototypeProps) {
    // Skip constructor and conventionally private methods (starting with _)
    if (methodName === "constructor" || methodName.startsWith("_")) {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      handler.prototype,
      methodName,
    );
    const isMethod = descriptor && typeof descriptor.value === "function";

    if (isMethod && !VALID_METHOD_NAMES.includes(<Key>methodName)) {
      const suggestions = FIND_SUGGESTIONS(methodName, VALID_METHOD_NAMES);
      const lines = [
        `ActionSchema ${actionName} contains invalid method "${methodName}". `,
        `Valid methods are: ${VALID_METHOD_NAMES.join(", ")}`,
      ];

      if (suggestions.length > 0) {
        lines.push("");
        lines.push(`Do you mean: ${suggestions.join(", ")}?`);
        lines.push("");
      }

      lines.push(`If you want to keep this property name use one of these patterns: _${methodName} or #${methodName}`);

      const msg = str.newline(lines);
      self.loggerService.log(`actionValidationService exception thrown`, {
        msg,
      });
      throw new Error(msg);
    }
  }
};

/**
 * Validates that all public methods in an object-based action handler are in the allowed list.
 *
 * Inspects the object's own properties to find all method names and ensures they match
 * the VALID_METHOD_NAMES list. Private properties (starting with _) are skipped.
 *
 * @param actionName - Name of the action being validated
 * @param handler - Plain object implementing partial IPublicAction interface
 * @param self - ActionSchemaService instance for logging
 * @throws Error if any public method is not in VALID_METHOD_NAMES
 */
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
      const suggestions = FIND_SUGGESTIONS(methodName, VALID_METHOD_NAMES);
      const lines = [
        `ActionSchema ${actionName} contains invalid method "${methodName}". `,
        `Valid methods are: ${VALID_METHOD_NAMES.join(", ")}`,
      ];

      if (suggestions.length > 0) {
        lines.push("");
        lines.push(`Do you mean: ${suggestions.join(", ")}?`);
        lines.push("");
      }

      lines.push(`If you want to keep this property name use one of these patterns: _${methodName} or #${methodName}`);

      const msg = str.newline(lines);
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
 * Manages registration, validation and retrieval of action schemas.
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Validates that action handlers only contain allowed public methods
 * from the IPublicAction interface.
 *
 * Key features:
 * - Type-safe action schema registration
 * - Method name validation for class and object handlers
 * - Private method support (methods starting with _ or #)
 * - Schema override capabilities
 *
 * @example
 * ```typescript
 * // Register a class-based action
 * actionSchemaService.register("telegram-notifier", {
 *   actionName: "telegram-notifier",
 *   handler: TelegramNotifierAction,
 *   callbacks: { ... }
 * });
 *
 * // Register an object-based action
 * actionSchemaService.register("logger", {
 *   actionName: "logger",
 *   handler: {
 *     signal: async (event) => { ... },
 *     dispose: async () => { ... }
 *   }
 * });
 * ```
 */
export class ActionSchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<ActionName, IActionSchema>>(
    "actionSchema",
  );

  /**
   * Registers a new action schema.
   *
   * Validates the schema structure and method names before registration.
   * Throws an error if the action name already exists in the registry.
   *
   * @param key - Unique action name identifier
   * @param value - Action schema configuration with handler and optional callbacks
   * @throws Error if action name already exists in registry
   * @throws Error if validation fails (missing required fields, invalid handler, invalid method names)
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
   * Also validates that all public methods in the handler are allowed.
   *
   * @param actionSchema - Action schema to validate
   * @throws Error if actionName is missing or not a string
   * @throws Error if handler is not a function or plain object
   * @throws Error if handler contains invalid public method names
   * @throws Error if callbacks is provided but not an object
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
   * Merges provided partial schema updates with the existing schema.
   * Useful for modifying handler or callbacks without re-registering the entire schema.
   *
   * @param key - Action name to override
   * @param value - Partial schema updates to merge
   * @returns Updated action schema after override
   * @throws Error if action name doesn't exist in registry
   */
  public override = (key: ActionName, value: Partial<IActionSchema>) => {
    this.loggerService.log(`actionSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  };

  /**
   * Retrieves an action schema by name.
   *
   * Returns the complete action schema configuration including handler and callbacks.
   * Used internally by ActionConnectionService to instantiate ClientAction instances.
   *
   * @param key - Action name identifier
   * @returns Action schema configuration
   * @throws Error if action name doesn't exist in registry
   */
  public get = (key: ActionName): IActionSchema => {
    this.loggerService.log(`actionSchemaService get`, { key });
    return this._registry.get(key);
  };
}

export default ActionSchemaService;
