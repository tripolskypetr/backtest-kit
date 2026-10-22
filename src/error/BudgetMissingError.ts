import { getErrorMessage } from "functools-kit";
import get from "../utils/get";

const BUDGET_MISSING_ERROR_TYPE = Symbol.for("BudgetMissingError");

const ERROR_MESSAGE_DEFAULT = "BudgetMissingError";

/**
 * A static `Budget` call reached a record that does not exist yet and gave no
 * `initialCapital` to create it with.
 *
 * A record is created by the first call that touches it. The strategy's own
 * instance methods always carry the capital of `new Budget({ name, initialCapital })`;
 * a static call (a listener, a dashboard) that comes first would otherwise create
 * the record with a capital it does not know, and a later call with the right
 * capital could never repair it. So the call is refused, nothing is created,
 * and the next call that brings `initialCapital` creates the record properly.
 *
 * Nominal runtime identification: the framework and user code recognize the
 * error by the `__type__ === Symbol.for("BudgetMissingError")` brand via the
 * static guard — never by `instanceof`, so it survives duplicated module
 * instances across bundles.
 *
 * @example
 * ```typescript
 * try {
 *   return await Budget._getBalance(context);
 * } catch (error) {
 *   if (BudgetMissingError.isBudgetMissingError(error)) return null; // nothing recorded yet
 *   throw error;
 * }
 * ```
 */
export class BudgetMissingError extends Error {
  /** Runtime brand (Symbol.for — survives duplicated module instances) */
  public readonly __type__ = BUDGET_MISSING_ERROR_TYPE;

  /**
   * @param message - Optional human-readable reason (logged, not routed on)
   */
  constructor(message = ERROR_MESSAGE_DEFAULT) {
    super(message);
    this.name = "BudgetMissingError";
  }

  /**
   * Nominal type guard by the runtime brand. Use this instead of `instanceof`:
   * the check is based on `Symbol.for`, so it recognizes instances created by a
   * DIFFERENT copy of this module (duplicated bundles, linked packages).
   *
   * @param error - Any thrown object
   * @returns true when the object carries the BudgetMissingError brand
   */
  static isBudgetMissingError(error: object): boolean {
    if (get(error, "__type__") === BUDGET_MISSING_ERROR_TYPE) {
      return true;
    }
    return false;
  }

  /**
   * Nominal constructor for a new BudgetMissingError from any thrown object.
   *
   * @param error - Any thrown object
   * @returns a new BudgetMissingError with the original message, or a default message
   *          if the original was not a string
   */
  static fromError(error: object): BudgetMissingError {
    return new BudgetMissingError(getErrorMessage(error) || ERROR_MESSAGE_DEFAULT);
  }
}

export default BudgetMissingError;
