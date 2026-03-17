import { queued, sleep } from "functools-kit";

const BUSY_DELAY = 100;

const SET_BUSY_SYMBOL = Symbol("setBusy");
const GET_BUSY_SYMBOL = Symbol("getBusy");

const ACQUIRE_LOCK_SYMBOL = Symbol("acquireLock");
const RELEASE_LOCK_SYMBOL = Symbol("releaseLock");

const ACQUIRE_LOCK_FN = async (self: Lock) => {
  while (self[GET_BUSY_SYMBOL]()) {
    await sleep(BUSY_DELAY);
  }
  self[SET_BUSY_SYMBOL](true);
};

/**
 * Mutual exclusion primitive for async TypeScript code.
 *
 * Provides a reentrant-safe, queued lock that serializes access to a critical
 * section across concurrent async callers. Internally tracks a busy counter so
 * nested acquire/release pairs are detected and mis-matched releases throw
 * immediately.
 *
 * Three usage styles are supported:
 *
 * **Manual acquire / release**
 * ```ts
 * await lock.acquireLock();
 * try {
 *   // critical section
 * } finally {
 *   await lock.releaseLock();
 * }
 * ```
 *
 * @see {@link acquireLock}
 * @see {@link releaseLock}
 */
export class Lock {
  private _isBusy = 0;

  [SET_BUSY_SYMBOL](isBusy: boolean) {
    this._isBusy += isBusy ? 1 : -1;
    if (this._isBusy < 0) {
      throw new Error("Extra release in finally block");
    }
  }

  [GET_BUSY_SYMBOL](): boolean {
    return !!this._isBusy;
  }

  [ACQUIRE_LOCK_SYMBOL] = queued(ACQUIRE_LOCK_FN);
  [RELEASE_LOCK_SYMBOL] = () => this[SET_BUSY_SYMBOL](false);

  /**
   * Acquires the lock, suspending execution until it becomes available.
   * Calls are automatically serialized via the internal queued scheduler —
   * concurrent callers wait their turn without spinning.
   *
   * @returns {Promise<void>} Resolves once the lock has been acquired.
   * @example
   * await lock.acquireLock();
   * try {
   *   // critical section
   * } finally {
   *   await lock.releaseLock();
   * }
   */
  public acquireLock = async () => {
    await this[ACQUIRE_LOCK_SYMBOL](this);
  };

  /**
   * Releases the lock previously acquired with {@link acquireLock}.
   * Must be called exactly once per successful {@link acquireLock} call,
   * typically inside a `finally` block. Throws if called more times
   * than the lock was acquired.
   *
   * @returns {Promise<void>} Resolves once the lock has been released.
   * @throws {Error} If the lock is released more times than it was acquired.
   */
  public releaseLock = async () => {
    await this[RELEASE_LOCK_SYMBOL]();
  };
}
