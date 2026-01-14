/**
 * Logger interface for application logging.
 *
 * Provides four logging levels for diagnostic output during LLM operations.
 * Can be implemented with console.log, winston, pino, or any other logging backend.
 *
 * @example
 * ```typescript
 * import { setLogger } from '@backtest-kit/ollama';
 *
 * setLogger({
 *   log: console.log,
 *   debug: console.debug,
 *   info: console.info,
 *   warn: console.warn,
 * });
 * ```
 */
export interface ILogger {
  /**
   * General logging for standard messages.
   *
   * @param topic - Log topic/category for filtering
   * @param args - Additional arguments to log
   */
  log(topic: string, ...args: any[]): void;

  /**
   * Debug-level logging for detailed diagnostic information.
   *
   * @param topic - Log topic/category for filtering
   * @param args - Additional arguments to log
   */
  debug(topic: string, ...args: any[]): void;

  /**
   * Info-level logging for informational messages.
   *
   * @param topic - Log topic/category for filtering
   * @param args - Additional arguments to log
   */
  info(topic: string, ...args: any[]): void;

  /**
   * Warning-level logging for non-critical issues.
   *
   * @param topic - Log topic/category for filtering
   * @param args - Additional arguments to log
   */
  warn(topic: string, ...args: any[]): void;
}
