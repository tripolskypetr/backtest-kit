/** Role of the message sender in an LLM chat history. */
export type MessageRole = "assistant" | "system" | "tool" | "user";

/**
 * A tool call requested by the assistant.
 * Represents a single function invocation emitted in an assistant message.
 */
export type MessageToolCall = {
  /** Unique identifier for this tool call, referenced by the tool result message via tool_call_id. */
  id: string;
  /** Always "function" — the only supported tool call type. */
  type: "function";
  /** The function to invoke. */
  function: {
    /** Name of the function to call. */
    name: string;
    /** Arguments passed to the function, keyed by parameter name. */
    arguments: {
      [key: string]: any;
    };
  };
}

/**
 * A single message in an LLM chat history.
 * Covers all roles: system instructions, user input, assistant responses, and tool results.
 */
export interface MessageModel<Role extends MessageRole = MessageRole> {
  /** Sender role — determines how the message is interpreted by the model. */
  role: Role;
  /** Text content of the message. Empty string for assistant messages that only contain tool_calls. */
  content: string;
  /** Tool calls emitted by the assistant. Present only on assistant messages. */
  tool_calls?: MessageToolCall[];
  /** Images attached to the message. Supported as Blob, raw bytes, or base64 strings. */
  images?: Blob[] | Uint8Array[] | string[];
  /** ID of the tool call this message is responding to. Present only on tool messages. */
  tool_call_id?: string;
}

export default MessageModel;
