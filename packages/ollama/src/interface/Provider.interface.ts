import { ISwarmCompletionArgs, IOutlineCompletionArgs, ISwarmMessage, IOutlineMessage } from "agent-swarm-kit";

/**
 * Provider interface for LLM inference operations.
 *
 * Defines the contract for LLM providers (OpenAI, Claude, DeepSeek, etc.)
 * to support completion, streaming, and structured output generation.
 * All providers must implement these three methods.
 *
 * @example
 * ```typescript
 * class CustomProvider implements IProvider {
 *   async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
 *     // Return full completion
 *   }
 *   async getStreamCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
 *     // Return streamed completion
 *   }
 *   async getOutlineCompletion(params: IOutlineCompletionArgs): Promise<IOutlineMessage> {
 *     // Return structured JSON output
 *   }
 * }
 * ```
 */
export interface IProvider {
  /**
   * Generate a standard completion from the LLM.
   *
   * @param params - Completion parameters (messages, model, temperature, etc.)
   * @returns Promise resolving to completion message
   */
  getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage>;

  /**
   * Generate a streaming completion from the LLM.
   *
   * @param params - Completion parameters (messages, model, temperature, etc.)
   * @returns Promise resolving to completion message (streamed)
   */
  getStreamCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage>;

  /**
   * Generate a structured JSON completion using JSON schema enforcement.
   *
   * Used for trading signals and other structured outputs where format
   * validation is critical. The outline parameter defines the JSON schema.
   *
   * @param params - Outline completion parameters with JSON schema
   * @returns Promise resolving to structured message
   */
  getOutlineCompletion(params: IOutlineCompletionArgs): Promise<IOutlineMessage>;
}

export default IProvider;
