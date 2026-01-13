import { AsyncResource } from "async_hooks";
import swarm, { ExecutionContextService, MethodContextService } from "../lib";

/**
 * Wraps a function to execute it outside of the current execution context if one exists.
 *
 * This utility ensures that the wrapped function runs in isolation from any existing
 * ExecutionContext, preventing context leakage and unintended context sharing between
 * async operations.
 *
 * @template T - Function type with any parameters and return type
 * @param {T} run - The function to be wrapped and executed outside of context
 * @returns {Function} A curried function that accepts the original function's parameters
 *                     and executes it outside of the current context if one exists
 *
 * @example
 * ```ts
 * const myFunction = async (param: string) => {
 *   // This code will run outside of any ExecutionContext
 *   return param.toUpperCase();
 * };
 *
 * const wrappedFunction = beginTime(myFunction);
 * const result = wrappedFunction('hello'); // Returns 'HELLO'
 * ```
 *
 * @example
 * ```ts
 * // Usage with trycatch wrapper
 * const safeFunction = trycatch(
 *   beginTime(async (id: number) => {
 *     // Function body runs isolated from parent context
 *     return await fetchData(id);
 *   })
 * );
 * ```
 */
export const beginTime =
  <T extends (...args: any[]) => any>(
    run: T
  ): ((...args: Parameters<T>) => ReturnType<T>) =>
  (...args: Parameters<T>): ReturnType<T> => {

    let fn = () => run(...args);

    if (ExecutionContextService.hasContext()) {
      fn = ExecutionContextService.runOutOfContext(fn);
    }

    return fn();
  };

export default beginTime;
