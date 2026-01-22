/**
 * Message role type for LLM conversation context.
 * Defines the sender of a message in a chat-based interaction.
 */
export type MessageRole = "assistant" | "system" | "user";

/**
 * Message model for LLM conversation history.
 * Used in Optimizer to build prompts and maintain conversation context.
 */
export interface MessageModel {
  /**
   * The sender of the message.
   * - "system": System instructions and context
   * - "user": User input and questions
   * - "assistant": LLM responses
   */
  role: MessageRole;

  /**
   * The text content of the message.
   * Contains the actual message text sent or received.
   */
  content: string;
}
