import { getErrorMessage } from "functools-kit";
import get from "../utils/get";

const BUDGET_REJECTED_ERROR_TYPE = Symbol.for("BudgetRejectedError");

const ERROR_MESSAGE_DEFAULT = "BudgetRejectedError";

/**
 * Business rejection of a `Budget` action: `reserve` asked for more than the
 * free balance, or `withdraw` asked for more units of an asset than the budget
 * holds, both at the logical time of the call.
 *
 * The rejection is recorded in the budget journal as a `reject` row (visible in
 * `getHistory()` and the budget report) BEFORE the error is thrown, so a refused
 * action is never silent. The strategy decides what to do with it — typically
 * `return null` from `getSignal` (no trade this tick).
 *
 * Nominal runtime identification: the framework and user code recognize the
 * error by the `__type__ === Symbol.for("BudgetRejectedError")` brand via the
 * static guard — never by `instanceof`, so it survives duplicated module
 * instances across bundles.
 *
 * Thrown only when `CC_BUDGET_THROW_ON_REJECT` is on; by default a refused
 * reserve / withdraw returns `false` and leaves a `reject` row in the journal.
 *
 * @example
 * ```typescript
 * // CC_BUDGET_THROW_ON_REJECT: true
 * try {
 *   await fund.reserve({ id, amount: cost });
 * } catch (error) {
 *   if (BudgetRejectedError.isBudgetRejectedError(error)) return null;
 *   throw error;
 * }
 * ```
 */
export class BudgetRejectedError extends Error {
  /** Runtime brand (Symbol.for — survives duplicated module instances) */
  public readonly __type__ = BUDGET_REJECTED_ERROR_TYPE;

  /**
   * @param message - Optional human-readable reason (logged, not routed on)
   */
  constructor(message = ERROR_MESSAGE_DEFAULT) {
    super(message);
    this.name = "BudgetRejectedError";
  }

  /**
   * Nominal type guard by the runtime brand. Use this instead of `instanceof`:
   * the check is based on `Symbol.for`, so it recognizes instances created by a
   * DIFFERENT copy of this module (duplicated bundles, linked packages).
   *
   * @param error - Any thrown object
   * @returns true when the object carries the BudgetRejectedError brand
   */
  static isBudgetRejectedError(error: object): boolean {
    if (get(error, "__type__") === BUDGET_REJECTED_ERROR_TYPE) {
      return true;
    }
    return false;
  }

  /**
   * Nominal constructor for a new BudgetRejectedError from any thrown object.
   *
   * @param error - Any thrown object
   * @returns a new BudgetRejectedError with the original message, or a default message
   *          if the original was not a string
   */
  static fromError(error: object): BudgetRejectedError {
    return new BudgetRejectedError(getErrorMessage(error) || ERROR_MESSAGE_DEFAULT);
  }
}

export default BudgetRejectedError;
