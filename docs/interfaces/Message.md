---
title: docs/interface/Message
group: docs
---

# Message

A single message in the chat history.
Used to represent system instructions, user input, or LLM responses.

## Properties

### role

```ts
role: Role
```

The sender of the message.
- "system": System instructions and context
- "user": User input and questions
- "assistant": LLM responses

### content

```ts
content: string
```

The text content of the message.
Contains the actual message text sent or received.
