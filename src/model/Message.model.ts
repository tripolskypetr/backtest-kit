export type MessageRole = "assistant" | "system" | "user";

export interface MessageModel {
  role: MessageRole;
  content: string;
}
