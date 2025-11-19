/**
 * Interface representing a logging mechanism for the swarm system.
 * Provides methods to record messages at different severity levels, used across components like agents, sessions, states, storage, swarms, history, embeddings, completions, and policies.
 * Logs are utilized to track lifecycle events (e.g., initialization, disposal), operational details (e.g., tool calls, message emissions), validation outcomes (e.g., policy checks), and errors (e.g., persistence failures), aiding in debugging, monitoring, and auditing.
*/
export interface ILogger {
  /**
   * Logs a general-purpose message.
   * Used throughout the swarm system to record significant events or state changes, such as agent execution, session connections, or storage updates.
   */
  log(topic: string, ...args: any[]): void;

  /**
   * Logs a debug-level message.
   * Employed for detailed diagnostic information, such as intermediate states during agent tool calls, swarm navigation changes, or embedding creation processes, typically enabled in development or troubleshooting scenarios.
   */
  debug(topic: string, ...args: any[]): void;

  /**
   * Logs an info-level message.
   * Used to record informational updates, such as successful completions, policy validations, or history commits, providing a high-level overview of system activity without excessive detail.
   */
  info(topic: string, ...args: any[]): void;
}
