import { queued, Subject } from "functools-kit";

const SET_BUSY_SYMBOL = Symbol("setBusy");
const GET_BUSY_SYMBOL = Symbol("getBusy");

const ACQUIRE_LOCK_SYMBOL = Symbol("acquireLock");
const RELEASE_LOCK_SYMBOL = Symbol("releaseLock");

/**
 * Body of the queued acquire operation.
 *
 * Parks the caller on `self._tick` whenever the lock is already busy: each
 * `releaseLock` emits on `_tick`, waking exactly the next queued acquirer
 * instead of polling on a fixed delay. The busy counter is bumped only after
 * the loop exits, so re-entry checks remain coherent under contention.
 *
 * @param self - The owning {@link Lock} instance.
 */
const ACQUIRE_LOCK_FN = async (self: Lock) => {
  while (self[GET_BUSY_SYMBOL]()) {
    // @ts-ignore
    await self._tick.toPromise();
  }
  self[SET_BUSY_SYMBOL](true);
};

/**
 * Mutual exclusion primitive for async TypeScript code.
 *
 * Provides a queued lock that serializes access to a critical section across
 * concurrent async callers. Wake-ups are event-driven (via an internal
 * `_tick` subject emitted on every `releaseLock`) rather than polling,
 * so contention does not incur a fixed delay.
 *
 * The busy counter detects mis-matched releases and throws immediately on
 * extra `releaseLock` calls.
 *
 * **Usage**
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
  /**
   * Outstanding acquires that have not yet been released.
   * Incremented in `[SET_BUSY_SYMBOL](true)`, decremented in `[SET_BUSY_SYMBOL](false)`.
   * A negative value indicates an extra `releaseLock` and throws on detection.
   */
  private _isBusy = 0;
  /**
   * Wake-up channel for {@link ACQUIRE_LOCK_FN}.
   * Every {@link releaseLock} emits a single tick that unblocks the next
   * queued acquirer parked on `toPromise()`.
   */
  private _tick = new Subject<void>();

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
   * Releases the lock previously acquired with {@link acquireLock} and emits
   * on the internal `_tick` subject to wake the next queued acquirer.
   *
   * Must be called exactly once per successful {@link acquireLock} call,
   * typically inside a `finally` block. Throws if called more times than
   * the lock was acquired.
   *
   * @returns {Promise<void>} Resolves once the lock has been released.
   * @throws {Error} If the lock is released more times than it was acquired.
   */
  public releaseLock = async () => {
    await this[RELEASE_LOCK_SYMBOL]();
    await this._tick.next();
  };
}
