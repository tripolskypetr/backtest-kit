import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { ActionName, IActionSchema } from "../../../interfaces/Action.interface";
import { memoize } from "functools-kit";

/**
 * Service for managing and validating action handler configurations.
 *
 * Maintains a registry of all configured action handlers and validates
 * their existence before operations. Uses memoization for performance.
 *
 * Key features:
 * - Registry management: addAction() to register new action handlers
 * - Validation: validate() ensures action handler exists before use
 * - Memoization: validation results are cached by actionName:source for performance
 * - Listing: list() returns all registered action handlers
 *
 * @throws {Error} If duplicate action name is added
 * @throws {Error} If unknown action handler is referenced
 *
 * @example
 * ```typescript
 * const actionValidation = new ActionValidationService();
 * actionValidation.addAction("telegram-notifier", telegramSchema);
 * actionValidation.validate("telegram-notifier", "strategy-1"); // OK
 * actionValidation.validate("unknown", "strategy-2"); // Throws error
 * ```
 */
export class ActionValidationService {
  /**
   * @private
   * @readonly
   * Injected logger service instance
   */
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * @private
   * Map storing action schemas by action name
   */
  private _actionMap = new Map<ActionName, IActionSchema>();

  /**
   * Adds an action schema to the validation service
   * @public
   * @throws {Error} If actionName already exists
   */
  public addAction = (actionName: ActionName, actionSchema: IActionSchema): void => {
    this.loggerService.log("actionValidationService addAction", {
      actionName,
      actionSchema,
    });
    if (this._actionMap.has(actionName)) {
      throw new Error(`action ${actionName} already exist`);
    }
    this._actionMap.set(actionName, actionSchema);
  };

  /**
   * Validates the existence of an action handler
   * @public
   * @throws {Error} If actionName is not found
   * Memoized function to cache validation results
   */
  public validate = memoize(
    ([actionName, source]) => `${actionName}:${source}`,
    (actionName: ActionName, source: string): void => {
      this.loggerService.log("actionValidationService validate", {
        actionName,
        source,
      });
      const action = this._actionMap.get(actionName);
      if (!action) {
        throw new Error(
          `action ${actionName} not found source=${source}`
        );
      }
      return true as never;
    }
  ) as (actionName: ActionName, source: string) => void;

  /**
   * Returns a list of all registered action schemas
   * @public
   * @returns Array of action schemas with their configurations
   */
  public list = async (): Promise<IActionSchema[]> => {
    this.loggerService.log("actionValidationService list");
    return Array.from(this._actionMap.values());
  };
}

/**
 * @exports ActionValidationService
 * Default export of ActionValidationService class
 */
export default ActionValidationService;
